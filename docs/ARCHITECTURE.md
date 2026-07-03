# FASTBREAK 5 — Architecture

One-thumb, portrait, 3D 5v5 basketball (Three.js), targeting iOS: **installable PWA first, Capacitor wrap for the App Store second**. No build step — plain ES modules served statically, so the same files run in a browser tab, an installed PWA, and a Capacitor WebView.

## The keystone: engine-as-service (P0 — DONE)

Every mode talks to basketball through one contract, defined in `src/core/contract.js`:

```
MatchConfig  ──►  engine  ──►  MatchResult
```

- **MatchConfig**: seed, court (full/half), sides (1–5), difficulty, rules (timed quarters or first-to-N, standard or ones-and-twos scoring), two TeamSpecs with PlayerSpec lineups (10 attrs + badges), optional `myPlayer` slot pointer, optional graded objectives, free-form `meta`.
- **MatchResult**: score, winner, per-period scores, full box scores (pts/fg/3pt/reb/oreb/ast/stl/blk/tov/dunks), a graded `myPlayer` block (A+–F + objective evaluation), highlights, duration.
- `validateMatchConfig` / `validateMatchResult` enforce the contract at both ends; grading (`gradePerformance`) is shared so an A- means the same thing in every engine.

### Two engines, one contract

| | `src/engine/headless.js` | `game/fastbreak5v5.html` (bridge) |
|---|---|---|
| Kind | possession-level statistical sim | the real playable 3D game |
| Supports | entire config space (1v1–5v5, half/full, timed/target) | full-court 5v5 (half-court is P3) |
| Determinism | fully deterministic per seed | interactive (seed echoed, not replayable) |
| Used for | MyCareer "sim" games, Park bot ladders, tests | story/key games, quick match |

The playable game is still one self-contained file, instrumented rather than rewritten:

- `MSTAT` records the box score at the exact event sites (shots, rebounds via `catchBall` after iron, assist windows, steals/blocks/turnovers, per-quarter splits, highlights).
- A `<script type="module">` **bridge** at the bottom of the file reads `sessionStorage["fb5.matchConfig"]`, applies lineups/rules/difficulty, skips the menu, and on the final buzzer writes `fb5.matchResult` + postMessages it. Without a config the game is byte-for-byte the classic standalone experience.
- `AUTOPLAY` (CPU vs CPU) and `TIMESCALE` exist solely so automated tests can run real matches headlessly.

### Badge hooks fire inside both engines

`src/player/badges.js` defines multipliers keyed by **hook names** (`shot.pct`, `shot.window`, `finish.pct`, `move.break`, `steal.chance`, `block.chance`, `reb.range`, `def.window`, `pass.assist`). The headless engine imports it directly; the playable game calls the same function through `window.__fb5Badge` (armed by the bridge) via `badgeMul()` — standalone, every hook resolves to 1.

## MyPlayer (P1 — DONE)

`src/player/` — one persistent entity consumed by every mode:

- **Archetypes** (`archetypes.js`): Slasher / Sharpshooter / Playmaker / Lockdown / Rim Protector / Two-Way. Each sets attribute **caps** and per-badge **max tiers**. Starting attrs = 72% of cap.
- **Physical build** (`body.js`): the player builder. Height (position range, trimmed by archetype cap), wingspan (−1"…+7"), body type (slim/balanced/strong), skin tone. Choices bake tradeoffs into starting attrs (taller/longer → boards/defense, worse shooting/speed; slim ↔ strong swaps burst for strength) and travel to engines as `PlayerSpec.look` — the playable game renders skin color, frame width and arm length from it.
- **Badges** (`badges.js`): 12 badges, Bronze→HoF, cost via `BADGE_TIER_COST`.
- **Economy** (`myplayer.js`): UP buys attribute points (cost curve steepens toward the cap; height not purchasable), Rep buys badge tiers. Currencies flow **only from play** (`rewardsFor(grade)`), cosmetics-only if ever monetized.
- `toPlayerSpec(mp)` is the only thing engines ever see.

## Save (P1 — DONE)

`src/save/store.js` — the entire game state is **one serializable JSON blob** (`schema`, `myPlayer`, `career`, `park`, `settings`, `rosters`). Backends: IndexedDB → localStorage → memory, auto-picked; `migrate()` handles schema bumps; export/import for debugging and, later, cloud sync (a transport swap, nothing else).

## App shell

- `index.html` + `src/app/hub.js`: locker-room hub (create/upgrade/badges, quick match via playable bridge, one-tap sim via headless engine, result view, rewards). Park/MyCareer buttons stubbed with phase tags.
- PWA: `manifest.webmanifest`, cache-first `sw.js` (works fully offline once installed), generated icons. Three.js r128 is **vendored** (`vendor/`) — no CDN dependency.

## Decisions taken (the 7 pre-P0 opens)

1. **Park hub**: court-select menu-map (not walkable) — better one-thumb, zero new engine work.
2. **Currencies**: two (UP attributes / Rep badges+cosmetics), as designed.
3. **Story**: linear 7-chapter spine with flavor choices; no hard branch in v1.
4. **Key games per season**: 10 (default; data-driven, trivially tunable).
5. **Half-court**: headless engine supports it *now* (so Park/1v1 sims work); playable half-court is the P3 engine task.
6. **Platform**: skipped the in-memory-HTML prototype step — went straight to static ES modules + IndexedDB saves + PWA. Still zero build tooling.
7. **v1 target**: decide at P3 exit; the seams don't care.

## Roadmap status

- **P0 contract** ✅ (both engines, validated, smoke-tested)
- **P1 MyPlayer + save** ✅
- **P2 badges + economy** ✅ core (hooks live in both engines; more badges/cosmetics later)
- **P3 Park**: court-select hub, `OpponentProvider` interface (BotProvider now, NetProvider later), playable half-court + small-sided, rep ladder
- **P4 MyCareer skeleton**: season structure (key games + one-tap sim), pre-game objectives, post-game grades — all of which already exist at the contract level
- **P5 story runtime** (scene graph: triggers → lines → choices → effects), Ch 0–2, Rival #1
- **P6 relationships** (Coach Trust / Chemistry / Media / Fan Rep) + remaining chapters
- **P7 cosmetics + emote taunts** · **Later**: NetProvider, cloud saves

## Testing

- `npm test` — 33 unit tests (contract, headless determinism/sanity/badges, MyPlayer economy, save).
- `npm run test:smoke` — real Chromium runs: (a) bridged autoplay match through the playable engine → validated MatchResult; (b) full hub journey: create → upgrade → sim → rewards → reload persistence → classic game regression.
- `npm run serve` — zero-dep dev server.

## iOS path

1. Serve over HTTPS → installable PWA (add-to-home-screen), fully offline via service worker.
2. `npx cap init && npx cap add ios`, point `webDir` at the repo root (or a copied `www/`), swap IndexedDB for Capacitor Preferences/Filesystem *behind the SaveStore backend interface*, add Haptics calls at the existing `impact()` sites.
3. Never rewrite the engine — it is already the product.
