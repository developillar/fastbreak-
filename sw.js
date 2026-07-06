/* Cache-first service worker — the whole game works offline once installed.
   Bump VERSION on every deploy that changes any precached file. */
/* KEEP IN SYNC (tests/version.test.mjs enforces): sw.js VERSION,
   version.json, index.html footer tag, hub.js APP_VERSION */
const VERSION = "fb5-v0.11.0";
const PRECACHE = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./game/fastbreak5v5.html",
  "./vendor/three.r128.min.js",
  "./src/app/hub.js",
  "./src/core/contract.js",
  "./src/core/rng.js",
  "./src/core/attributes.js",
  "./src/core/league.js",
  "./src/engine/headless.js",
  "./src/player/archetypes.js",
  "./src/player/badges.js",
  "./src/player/body.js",
  "./src/player/face.js",
  "./src/player/myplayer.js",
  "./src/app/scenes.js",
  "./src/save/store.js",
  "./src/career/story.js",
  "./src/park/park.js",
  "./src/career/career.js",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;

  // the version beacon must NEVER come from any cache — it is how stale
  // clients discover they are stale
  if (e.request.url.includes("version.json")) return;

  /* NETWORK-FIRST for pages AND app code so every online load is
     version-coherent (a fresh page never runs against stale scripts).
     Cache is the offline fallback. Only the big immutable assets
     (vendored three.js, icons) stay cache-first for speed. */
  const url = new URL(e.request.url);
  const cacheFirst = /\/(vendor|icons)\//.test(url.pathname);

  if (!cacheFirst) {
    e.respondWith(
      fetch(e.request).then(res => {
        if (res.ok && url.origin === location.origin) {
          const copy = res.clone();
          caches.open(VERSION).then(c => c.put(e.request, copy));
        }
        return res;
      }).catch(() =>
        caches.match(e.request, { ignoreSearch: true }).then(hit =>
          hit || (e.request.mode === "navigate" ? caches.match("./index.html") : Response.error())
        )
      )
    );
    return;
  }

  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then(hit =>
      hit ||
      fetch(e.request).then(res => {
        if (res.ok && url.origin === location.origin) {
          const copy = res.clone();
          caches.open(VERSION).then(c => c.put(e.request, copy));
        }
        return res;
      })
    )
  );
});
