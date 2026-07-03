import { test } from "node:test";
import assert from "node:assert/strict";
import { makeMatchConfig, validateMatchResult } from "../src/core/contract.js";
import { buildLeague, toTeamSpec } from "../src/core/league.js";
import { simulate, headlessEngine } from "../src/engine/headless.js";
import { createMyPlayer, toPlayerSpec } from "../src/player/myplayer.js";

const league = buildLeague();
const home = toTeamSpec(league[0]);
const away = toTeamSpec(league[1]);

function cfg(overrides = {}) {
  return makeMatchConfig({ seed: 7, home, away, ...overrides });
}

test("headless engine supports the whole config space", () => {
  assert.ok(headlessEngine.supports(cfg()));
});

test("simulate returns a valid, internally consistent MatchResult", () => {
  const res = simulate(cfg());
  assert.ok(validateMatchResult(res));
  assert.equal(res.engine, "headless");
  assert.equal(res.periods.length >= 4, true);
  for (const side of ["home", "away"]) {
    for (const l of res.boxScore[side]) {
      assert.ok(l.fgm <= l.fga, "fgm<=fga");
      assert.ok(l.tpm <= l.tpa, "tpm<=tpa");
      assert.equal(l.pts, (l.fgm - l.tpm) * 2 + l.tpm * 3, "pts consistent with makes");
      assert.ok(l.oreb <= l.reb);
    }
  }
  const periodSum = res.periods.reduce((s, p) => s + p.home, 0);
  assert.equal(periodSum, res.score.home, "period scores sum to final");
});

test("same seed -> identical result; different seed -> different game", () => {
  const a = simulate(cfg()), b = simulate(cfg());
  assert.deepEqual(a, b);
  const c = simulate(cfg({ seed: 8 }));
  assert.notDeepEqual(a.boxScore, c.boxScore);
});

test("scores land in a plausible basketball range for 4x120s", () => {
  let lo = Infinity, hi = -Infinity;
  for (let s = 1; s <= 30; s++) {
    const r = simulate(cfg({ seed: s }));
    lo = Math.min(lo, r.score.home, r.score.away);
    hi = Math.max(hi, r.score.home, r.score.away);
  }
  assert.ok(lo >= 4, "min score too low: " + lo);
  assert.ok(hi <= 60, "max score too high: " + hi);
});

test("timed games never end in a tie (OT resolves)", () => {
  for (let s = 100; s < 160; s++) {
    const r = simulate(cfg({ seed: s }));
    assert.notEqual(r.score.home, r.score.away);
  }
});

test("all sides 1..5 and half court simulate", () => {
  for (let sides = 1; sides <= 5; sides++) {
    const r = simulate(cfg({ sides, court: sides < 4 ? "half" : "full", seed: sides * 11 }));
    assert.ok(validateMatchResult(r));
    assert.equal(r.boxScore.home.length, sides);
    if (sides === 1) {
      assert.equal(r.boxScore.home[0].ast + r.boxScore.away[0].ast, 0, "no assists in 1v1");
    }
  }
});

test("target mode: first to 21 win-by-2, park scoring", () => {
  for (let s = 1; s <= 20; s++) {
    const r = simulate(cfg({
      seed: s, sides: 3, court: "half",
      rules: { mode: "target", targetScore: 21, winBy: 2, scoring: "ones-and-twos" },
    }));
    const w = Math.max(r.score.home, r.score.away);
    const l = Math.min(r.score.home, r.score.away);
    assert.ok(w >= 21, "winner reached target");
    assert.ok(w - l >= 2, "won by 2");
    for (const side of ["home", "away"]) {
      for (const ln of r.boxScore[side]) {
        assert.equal(ln.pts, (ln.fgm - ln.tpm) * 1 + ln.tpm * 2, "ones-and-twos scoring");
      }
    }
  }
});

test("myPlayer gets a graded line and objective evaluation", () => {
  const mp = createMyPlayer({ name: "Rook", position: "SG", archetypeId: "sharpshooter" });
  const lineup = [toPlayerSpec(mp), ...home.lineup.slice(1)];
  const r = simulate(cfg({
    home: { ...home, lineup },
    myPlayer: { side: "home", index: 0 },
    objectives: [{ id: "score10", type: "points", target: 10 }],
    seed: 99,
  }));
  assert.ok(r.myPlayer);
  assert.equal(r.myPlayer.line.id, "myplayer");
  assert.match(r.myPlayer.grade, /^[A-F][+-]?$/);
  assert.equal(r.myPlayer.objectives.length, 1);
  assert.equal(typeof r.myPlayer.objectives[0].met, "boolean");
});

test("badges shift outcomes: HoF shooting badges raise 3pt volume production", () => {
  const base = createMyPlayer({ name: "A", position: "SG", archetypeId: "sharpshooter" });
  const badged = createMyPlayer({ name: "B", position: "SG", archetypeId: "sharpshooter" });
  badged.badges = { deadeye: 4, limitless: 4, green_machine: 4 };
  let ptsBase = 0, ptsBadged = 0;
  for (let s = 1; s <= 120; s++) {
    for (const [mp, tally] of [[base, "base"], [badged, "badged"]]) {
      const lineup = [toPlayerSpec(mp), ...home.lineup.slice(1)];
      const r = simulate(cfg({
        home: { ...home, lineup }, myPlayer: { side: "home", index: 0 }, seed: s,
      }));
      if (tally === "base") ptsBase += r.myPlayer.line.pts;
      else ptsBadged += r.myPlayer.line.pts;
    }
  }
  assert.ok(ptsBadged > ptsBase, `badged ${ptsBadged} should out-produce base ${ptsBase}`);
});

test("highlights reference real players", () => {
  const r = simulate(cfg({ seed: 3 }));
  assert.ok(r.highlights.length > 0);
  const ids = new Set([...home.lineup, ...away.lineup].map(p => p.id));
  for (const h of r.highlights) assert.ok(ids.has(h.playerId), "highlight player exists");
});
