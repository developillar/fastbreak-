/* =============================================================================
   P0 KEYSTONE — the engine-as-service contract.

   Every basketball experience in the app (MyCareer story games, one-tap sims,
   Park runs, quick match) speaks this contract:

       MatchEngine.simulate(MatchConfig) -> MatchResult          (headless)
       playable game <- MatchConfig via bridge -> MatchResult    (interactive)

   Engines declare what slice of the config space they support via
   `supports(config)`; callers pick an engine, never reach into engine guts.
   Badges, difficulty, court size and rules all travel INSIDE the config so
   modes never special-case the engine.
   ========================================================================== */

import { ATTR_KEYS, ROLES, clampAttrs } from "./attributes.js";

export const CONTRACT_SCHEMA = 1;

/* ---------------------------------------------------------------------------
 * MatchConfig
 * {
 *   schema: 1,
 *   seed: number,                      // drives ALL sim randomness
 *   court: "full" | "half",
 *   sides: 1..5,                       // players per team
 *   difficulty: 0 | 1 | 2,             // ROOKIE | PRO | ALL-STAR
 *   rules: {
 *     mode: "timed" | "target",
 *     quarters, quarterLength (s), shotClock (s),      // timed
 *     targetScore, winBy,                              // target ("first to 21")
 *     scoring: "standard" | "ones-and-twos",           // 2s/3s vs park 1s/2s
 *   },
 *   home: TeamSpec, away: TeamSpec,
 *   myPlayer: { side: "home"|"away", index: n } | null,
 *   objectives: [{ id, type, target }],  // graded into MatchResult.myPlayer
 *   meta: { label?, context? }           // free-form (e.g. "Ch2: The Rival Game")
 * }
 *
 * TeamSpec  { id, name, abbr, colors: {primary, secondary, ui}, lineup: [PlayerSpec] }
 * PlayerSpec{ id, name, role, attrs: {10 keys, 0..1}, badges: [{id, tier}] }
 * ------------------------------------------------------------------------- */

export const OBJECTIVE_TYPES = ["points", "rebounds", "assists", "steals", "blocks", "threes", "dunks", "team_win", "grade_at_least"];

export function defaultRules(overrides = {}) {
  return {
    mode: "timed",
    quarters: 4,
    quarterLength: 120,
    shotClock: 24,
    targetScore: 21,
    winBy: 1,
    scoring: "standard",
    ...overrides,
  };
}

export function makePlayerSpec({ id, name, role = "SF", attrs = {}, badges = [], look = null }) {
  const spec = {
    id: String(id),
    name: String(name || "PLAYER"),
    role,
    attrs: clampAttrs(attrs),
    badges: badges.map(b => ({ id: b.id, tier: b.tier | 0 })),
  };
  /* optional renderable appearance: {skin, build, wingspan (-1..1)} —
     engines that draw bodies use it, the headless engine ignores it */
  if (look) spec.look = { skin: look.skin | 0, build: look.build || "balanced", wingspan: +look.wingspan || 0 };
  return spec;
}

export function makeMatchConfig({
  seed = 1,
  court = "full",
  sides = 5,
  difficulty = 1,
  rules = {},
  home,
  away,
  myPlayer = null,
  objectives = [],
  meta = {},
} = {}) {
  const cfg = {
    schema: CONTRACT_SCHEMA,
    seed: seed >>> 0,
    court, sides, difficulty,
    rules: defaultRules(rules),
    home, away, myPlayer,
    objectives,
    meta,
  };
  validateMatchConfig(cfg);
  return cfg;
}

function fail(msg) { throw new Error("MatchConfig invalid: " + msg); }

export function validateMatchConfig(cfg) {
  if (!cfg || typeof cfg !== "object") fail("not an object");
  if (cfg.schema !== CONTRACT_SCHEMA) fail("schema mismatch (got " + cfg.schema + ")");
  if (!Number.isFinite(cfg.seed)) fail("seed must be a number");
  if (cfg.court !== "full" && cfg.court !== "half") fail("court must be full|half");
  if (!Number.isInteger(cfg.sides) || cfg.sides < 1 || cfg.sides > 5) fail("sides must be 1..5");
  if (![0, 1, 2].includes(cfg.difficulty)) fail("difficulty must be 0|1|2");
  const r = cfg.rules;
  if (!r || (r.mode !== "timed" && r.mode !== "target")) fail("rules.mode must be timed|target");
  if (r.mode === "timed" && (!(r.quarters >= 1) || !(r.quarterLength > 0))) fail("timed rules need quarters/quarterLength");
  if (r.mode === "target" && !(r.targetScore >= 1)) fail("target rules need targetScore");
  if (r.scoring !== "standard" && r.scoring !== "ones-and-twos") fail("rules.scoring must be standard|ones-and-twos");
  for (const side of ["home", "away"]) {
    const t = cfg[side];
    if (!t || !Array.isArray(t.lineup)) fail(side + ".lineup missing");
    if (t.lineup.length < cfg.sides) fail(side + ".lineup has " + t.lineup.length + " players, needs >= " + cfg.sides);
    t.lineup.forEach((p, i) => {
      if (!p.id) fail(side + ".lineup[" + i + "].id missing");
      if (!ROLES.includes(p.role)) fail(side + ".lineup[" + i + "].role invalid: " + p.role);
      for (const k of ATTR_KEYS) {
        if (!Number.isFinite(p.attrs?.[k])) fail(side + ".lineup[" + i + "].attrs." + k + " missing");
      }
    });
  }
  if (cfg.myPlayer) {
    const { side, index } = cfg.myPlayer;
    if (side !== "home" && side !== "away") fail("myPlayer.side must be home|away");
    if (!cfg[side].lineup[index]) fail("myPlayer.index out of lineup range");
  }
  for (const o of cfg.objectives || []) {
    if (!OBJECTIVE_TYPES.includes(o.type)) fail("objective type invalid: " + o.type);
  }
  return true;
}

/* ---------------------------------------------------------------------------
 * MatchResult
 * {
 *   schema: 1, seed, engine: "headless"|"playable",
 *   score: {home, away}, winner: "home"|"away",
 *   periods: [{home, away}],
 *   boxScore: {home: [StatLine], away: [StatLine]},
 *   myPlayer: { line: StatLine, grade, gradeScore, teamWon,
 *               objectives: [{id, type, target, value, met}] } | null,
 *   highlights: [{t, type, playerId, playerName, side, detail?}],
 *   meta: echo of config.meta
 * }
 * ------------------------------------------------------------------------- */

export function emptyStatLine(p) {
  return {
    id: p.id, name: p.name, role: p.role,
    pts: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0,
    oreb: 0, reb: 0, ast: 0, stl: 0, blk: 0, tov: 0, dunks: 0,
  };
}

function failR(msg) { throw new Error("MatchResult invalid: " + msg); }

export function validateMatchResult(res) {
  if (!res || typeof res !== "object") failR("not an object");
  if (res.schema !== CONTRACT_SCHEMA) failR("schema mismatch");
  if (!res.score || !Number.isFinite(res.score.home) || !Number.isFinite(res.score.away)) failR("score missing");
  if (res.winner !== "home" && res.winner !== "away") failR("winner must be home|away");
  for (const side of ["home", "away"]) {
    const lines = res.boxScore?.[side];
    if (!Array.isArray(lines)) failR("boxScore." + side + " missing");
    let pts = 0;
    for (const l of lines) {
      if (l.fgm > l.fga || l.tpm > l.tpa || l.tpm > l.fgm) failR("stat line inconsistent for " + l.id);
      pts += l.pts;
    }
    if (pts !== res.score[side]) failR("boxScore." + side + " pts " + pts + " != score " + res.score[side]);
  }
  if (!Array.isArray(res.highlights)) failR("highlights missing");
  return true;
}

/* Grading — shared by both engines so an A- means the same thing everywhere. */
export function gradePerformance(line, { teamWon = false, sides = 5 } = {}) {
  const missPenalty = (line.fga - line.fgm) * 0.9;
  const raw =
    line.pts * 1.0 + line.reb * 1.1 + line.ast * 1.4 +
    line.stl * 1.8 + line.blk * 1.8 + line.dunks * 0.5 -
    line.tov * 1.6 - missPenalty;
  /* fewer players on the floor -> more stats available -> normalize */
  const scale = 5 / Math.max(1, sides);
  let score = 50 + (raw / scale) * 1.6 + (teamWon ? 6 : -3);
  score = Math.max(0, Math.min(100, Math.round(score)));
  const bands = [
    [92, "A+"], [85, "A"], [78, "A-"], [72, "B+"], [65, "B"], [58, "B-"],
    [52, "C+"], [45, "C"], [38, "C-"], [30, "D"], [0, "F"],
  ];
  const grade = bands.find(([min]) => score >= min)[1];
  return { score, grade };
}

export const GRADE_ORDER = ["F", "D", "C-", "C", "C+", "B-", "B", "B+", "A-", "A", "A+"];

export function evaluateObjectives(objectives, line, { teamWon, gradeScore } = {}) {
  return (objectives || []).map(o => {
    let value;
    switch (o.type) {
      case "points": value = line.pts; break;
      case "rebounds": value = line.reb; break;
      case "assists": value = line.ast; break;
      case "steals": value = line.stl; break;
      case "blocks": value = line.blk; break;
      case "threes": value = line.tpm; break;
      case "dunks": value = line.dunks; break;
      case "team_win": value = teamWon ? 1 : 0; break;
      case "grade_at_least": value = gradeScore; break;
      default: value = 0;
    }
    const target = o.type === "team_win" ? 1 : o.target;
    return { id: o.id, type: o.type, target, value, met: value >= target };
  });
}
