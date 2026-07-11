/* One serializable JSON blob is the entire save. IndexedDB is the primary
   backend (survives PWA/Capacitor), localStorage the fallback, memory the
   test/Node backend. Cloud sync later = swap the backend, nothing else. */

export const SAVE_SCHEMA = 1;
const DB_NAME = "fastbreak5";
const DB_STORE = "save";
const KEY = "blob";
const LS_KEY = "fb5.save.v1";

export function defaultSave() {
  return {
    schema: SAVE_SCHEMA,
    myPlayer: null,
    career: null,          // P4: season state, chapter progress, relationships
    park: { rep: 0, tier: "ROOKIE" },
    settings: { qlen: 120, diff: 1, haptics: true },
    rosters: null,         // roster-editor overrides
  };
}

/* migrations run in order; add an entry per schema bump */
const MIGRATIONS = {
  // 2: (blob) => { ...; blob.schema = 2; return blob; },
};
export function migrate(blob) {
  if (!blob || typeof blob !== "object") return defaultSave();
  let b = blob;
  while (b.schema < SAVE_SCHEMA) {
    const step = MIGRATIONS[b.schema + 1];
    if (!step) { b.schema = SAVE_SCHEMA; break; }
    b = step(b);
  }
  return { ...defaultSave(), ...b };
}

/* ---------------- backends ---------------- */
class MemoryBackend {
  constructor() { this.data = null; this.kind = "memory"; }
  async read() { return this.data ? JSON.parse(this.data) : null; }
  async write(blob) { this.data = JSON.stringify(blob); }
  async clear() { this.data = null; }
}

class LocalStorageBackend {
  constructor() { this.kind = "localStorage"; }
  async read() {
    const raw = globalThis.localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) : null;
  }
  async write(blob) { globalThis.localStorage.setItem(LS_KEY, JSON.stringify(blob)); }
  async clear() { globalThis.localStorage.removeItem(LS_KEY); }
}

class IdbBackend {
  constructor() { this.kind = "indexedDB"; this._db = null; }
  _open() {
    if (this._db) return Promise.resolve(this._db);
    return new Promise((resolve, reject) => {
      const req = globalThis.indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(DB_STORE);
      req.onsuccess = () => { this._db = req.result; resolve(this._db); };
      req.onerror = () => reject(req.error);
    });
  }
  async _tx(mode, fn) {
    const db = await this._open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(DB_STORE, mode);
      const req = fn(tx.objectStore(DB_STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  async read() { const v = await this._tx("readonly", s => s.get(KEY)); return v ?? null; }
  async write(blob) { await this._tx("readwrite", s => s.put(JSON.parse(JSON.stringify(blob)), KEY)); }
  async clear() { await this._tx("readwrite", s => s.delete(KEY)); }
}

export function pickBackend() {
  if (globalThis.indexedDB) return new IdbBackend();
  if (globalThis.localStorage) return new LocalStorageBackend();
  return new MemoryBackend();
}

export class SaveStore {
  constructor(backend = pickBackend()) {
    this.backend = backend;
    this._cache = null;
  }
  async load() {
    if (this._cache) return this._cache;
    let blob = null;
    try { blob = await this.backend.read(); }
    catch (e) {
      /* corrupted/blocked backend -> degrade rather than brick the app */
      if (this.backend.kind !== "memory") this.backend = new MemoryBackend();
    }
    /* the synchronous journal may be newer than the async backend if the
       page was torn down mid-write (reload/close aborts IDB transactions) */
    const j = this._journalRead();
    if (j && (!blob || (j.savedAt || 0) > (blob.savedAt || 0))) blob = j;
    this._cache = blob ? migrate(blob) : defaultSave();
    return this._cache;
  }
  async save(blob = this._cache) {
    if (!blob) throw new Error("nothing to save");
    if (blob.schema !== SAVE_SCHEMA) throw new Error("refusing to save wrong-schema blob");
    this._cache = blob;
    blob.savedAt = Date.now();
    this._journalWrite(blob);          // sync: survives instant reload/close
    await this.backend.write(blob);
    return blob;
  }
  /* localStorage journal — synchronous, so it commits even when an IDB
     write is aborted by navigation. Same key the LS backend uses. */
  _journalWrite(blob) {
    if (this.backend.kind === "localStorage") return; // backend IS the journal
    try { globalThis.localStorage?.setItem(LS_KEY, JSON.stringify(blob)); } catch {}
  }
  _journalRead() {
    try {
      const raw = globalThis.localStorage?.getItem(LS_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }
  /* convenience: load, mutate, persist */
  async update(fn) {
    const blob = await this.load();
    fn(blob);
    return this.save(blob);
  }
  async reset() {
    this._cache = defaultSave();
    try { globalThis.localStorage?.removeItem(LS_KEY); } catch {}
    await this.backend.clear();
    return this._cache;
  }
  async export_() { return JSON.stringify(await this.load()); }
  async import_(json) {
    const blob = migrate(JSON.parse(json));
    return this.save(blob);
  }
}
