import { test } from "node:test";
import assert from "node:assert/strict";
import { SaveStore, defaultSave, migrate, SAVE_SCHEMA } from "../src/save/store.js";
import { createMyPlayer } from "../src/player/myplayer.js";

/* Node has no IndexedDB/localStorage -> memory backend must be auto-picked */
test("backend fallback picks memory under Node", async () => {
  const store = new SaveStore();
  assert.equal(store.backend.kind, "memory");
});

test("load on empty store returns the default blob", async () => {
  const store = new SaveStore();
  const blob = await store.load();
  assert.equal(blob.schema, SAVE_SCHEMA);
  assert.equal(blob.myPlayer, null);
  assert.equal(blob.park.tier, "ROOKIE");
});

test("save/load roundtrip preserves the MyPlayer", async () => {
  const store = new SaveStore();
  await store.update(blob => {
    blob.myPlayer = createMyPlayer({ name: "Rook", position: "SG", archetypeId: "slasher" });
  });
  store._cache = null; // force re-read from backend
  const blob = await store.load();
  assert.equal(blob.myPlayer.name, "ROOK");
  assert.equal(blob.myPlayer.archetypeId, "slasher");
});

test("export/import is a faithful copy", async () => {
  const a = new SaveStore();
  await a.update(blob => { blob.park.rep = 777; });
  const json = await a.export_();
  const b = new SaveStore();
  await b.import_(json);
  assert.equal((await b.load()).park.rep, 777);
});

test("migrate tolerates junk and old blobs", () => {
  assert.equal(migrate(null).schema, SAVE_SCHEMA);
  assert.equal(migrate("garbage").schema, SAVE_SCHEMA);
  const old = { schema: 0, myPlayer: null };
  const migrated = migrate(old);
  assert.equal(migrated.schema, SAVE_SCHEMA);
  assert.ok(migrated.park, "missing sections backfilled");
});

test("reset returns to defaults", async () => {
  const store = new SaveStore();
  await store.update(blob => { blob.park.rep = 5; });
  await store.reset();
  assert.equal((await store.load()).park.rep, 0);
});

test("refuses to persist a wrong-schema blob", async () => {
  const store = new SaveStore();
  await assert.rejects(store.save({ schema: 999 }), /schema/);
});
