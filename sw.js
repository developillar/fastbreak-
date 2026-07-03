/* Cache-first service worker — the whole game works offline once installed.
   Bump VERSION on every deploy that changes any precached file. */
const VERSION = "fb5-v0.3.0";
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
  "./src/player/myplayer.js",
  "./src/save/store.js",
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
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then(hit =>
      hit ||
      fetch(e.request).then(res => {
        if (res.ok && new URL(e.request.url).origin === location.origin) {
          const copy = res.clone();
          caches.open(VERSION).then(c => c.put(e.request, copy));
        }
        return res;
      })
    )
  );
});
