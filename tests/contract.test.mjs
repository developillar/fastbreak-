import { test } from "node:test";
import assert from "node:assert/strict";
import {
  makeMatchConfig, validateMatchConfig, validateMatchResult,
  gradePerformance, evaluateObjectives, emptyStatLine, defaultRules,
} from "../src/core/contract.js";
import { buildLeague, toTeamSpec } from "../src/core/league.js";

const league = buildLeague();
const home = toTeamSpec(league[0]);
const away = toTeamSpec(league[1]);

test("makeMatchConfig produces a valid default 5v5 full-court config", () => {
  const cfg = makeMatchConfig({ seed: 42, home, away });
  assert.equal(cfg.schema, 1);
  assert.equal(cfg.sides, 5);
  assert.equal(cfg.court, "full");
  assert.equal(cfg.rules.mode, "timed");
  assert.ok(validateMatchConfig(cfg));
});

test("config validation rejects bad shapes", () => {
  assert.throws(() => makeMatchConfig({ home, away, sides: 0 }), /sides/);
  assert.throws(() => makeMatchConfig({ home, away, court: "street" }), /court/);
  assert.throws(() => makeMatchConfig({ home, away, difficulty: 5 }), /difficulty/);
  assert.throws(() => makeMatchConfig({ home: { lineup: [] }, away }), /lineup/);
  assert.throws(() => makeMatchConfig({ home, away, myPlayer: { side: "home", index: 9 } }), /myPlayer/);
  assert.throws(() => makeMatchConfig({ home, away, objectives: [{ id: "x", type: "nope", target: 1 }] }), /objective/);
});

test("target-mode rules validate", () => {
  const cfg = makeMatchConfig({
    home, away, sides: 3, court: "half",
    rules: { mode: "target", targetScore: 21, winBy: 2, scoring: "ones-and-twos" },
  });
  assert.equal(cfg.rules.targetScore, 21);
});

test("league lineups deterministic for a fixed seed", () => {
  const a = buildLeague(123), b = buildLeague(123);
  assert.deepEqual(a[3].lineup, b[3].lineup);
  assert.notDeepEqual(buildLeague(124)[3].lineup, a[3].lineup);
});

test("grading is monotonic and bounded", () => {
  const bad = { ...emptyStatLine({ id: "x", name: "X", role: "PG" }), pts: 2, fga: 12, fgm: 1, tov: 6 };
  const good = { ...emptyStatLine({ id: "x", name: "X", role: "PG" }), pts: 31, fga: 18, fgm: 12, reb: 6, ast: 8, stl: 3 };
  const gBad = gradePerformance(bad, { teamWon: false });
  const gGood = gradePerformance(good, { teamWon: true });
  assert.ok(gGood.score > gBad.score);
  assert.ok(gBad.score >= 0 && gGood.score <= 100);
  assert.equal(typeof gGood.grade, "string");
});

test("objectives evaluate against the stat line", () => {
  const line = { ...emptyStatLine({ id: "m", name: "M", role: "SG" }), pts: 15, ast: 2, tpm: 3 };
  const evald = evaluateObjectives(
    [{ id: "o1", type: "points", target: 12 }, { id: "o2", type: "assists", target: 5 }, { id: "o3", type: "team_win" }],
    line, { teamWon: true, gradeScore: 70 });
  assert.deepEqual(evald.map(o => o.met), [true, false, true]);
});

test("result validator catches inconsistent box scores", () => {
  const line = emptyStatLine({ id: "a", name: "A", role: "PG" });
  const res = {
    schema: 1, score: { home: 5, away: 0 }, winner: "home",
    boxScore: { home: [{ ...line, pts: 3 }], away: [line] },
    highlights: [],
  };
  assert.throws(() => validateMatchResult(res), /pts 3 != score 5/);
});

test("defaultRules merges overrides", () => {
  const r = defaultRules({ quarterLength: 300 });
  assert.equal(r.quarterLength, 300);
  assert.equal(r.shotClock, 24);
});
