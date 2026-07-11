# FASTBREAK 5

One-thumb, portrait, 3D 5v5 basketball — Three.js, no build step, iOS-targeted (PWA → Capacitor).

**MyPlayer · MyCareer · Park framework, P0–P2 landed:** the 5v5 game is now a callable engine behind a `MatchConfig → MatchResult` contract, with a deterministic headless sim twin, a persistent MyPlayer (archetypes, caps, badges, UP/Rep economy), and a one-blob save system.

## Run it

```bash
npm run serve          # → http://localhost:8054  (hub: create MyPlayer, play, sim)
npm test               # 33 unit tests (contract, engines, economy, save)
npm run test:smoke     # Chromium e2e: bridged autoplay match + full hub journey
```

`game/fastbreak5v5.html` still works as the classic standalone game (open it with no session config).

## Layout

```
index.html            app hub (PWA shell)          sw.js / manifest / icons/
game/fastbreak5v5.html playable engine + service bridge
src/core/             contract, attributes, league, rng
src/engine/           headless match engine
src/player/           myplayer, archetypes, badges
src/save/             one-blob SaveStore (IndexedDB→localStorage→memory)
src/app/              hub UI
tests/                unit + smoke        tools/    dev server, icon gen
vendor/               three.js r128 (vendored, no CDN)
```

Design doc: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — the contract, badge hooks, decisions log, and the P3+ roadmap.
