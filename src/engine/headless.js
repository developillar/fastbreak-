/* =============================================================================
   HEADLESS MATCH ENGINE — simulate(MatchConfig) -> MatchResult, no DOM, no
   Three.js, no wall clock. Deterministic for a given config (seeded RNG).

   This is the engine MyCareer uses to one-tap-sim filler games, the reference
   implementation that locks the P0 contract, and the stat model tuned to
   land in the same scoring neighborhood as the playable game so simmed and
   played box scores feel like the same sport.

   Badge hooks fire at the exact resolution points documented in badges.js.
   ========================================================================== */

import { Rng } from "../core/rng.js";
import {
  CONTRACT_SCHEMA, validateMatchConfig, emptyStatLine,
  gradePerformance, evaluateObjectives,
} from "../core/contract.js";
import { badgeMultiplier } from "../player/badges.js";

const SHOT_BASE = { DUNK: .94, LAYUP: .80, FLOATER: .64, CLOSE: .56, MID: .50, THREE: .43 };
const DIFF_PCT = [0.9, 1.0, 1.12];       // CPU (away) shooting dial vs difficulty
const SIDE_LABELS = ["home", "away"];

export const headlessEngine = {
  id: "headless",
  /* the headless engine supports the entire config space */
  supports() { return true; },
  simulate,
};

export function simulate(config) {
  validateMatchConfig(config);
  const rng = new Rng(config.seed || 1);
  const rules = config.rules;
  const sides = config.sides;

  const teams = SIDE_LABELS.map(side => {
    const spec = config[side];
    const players = spec.lineup.slice(0, sides).map(p => ({
      spec: p,
      line: emptyStatLine(p),
      /* usage: how often this player ends possessions with a shot */
      usage: 0.4 + p.attrs.three * .5 + p.attrs.mid * .35 + p.attrs.close * .5 + p.attrs.dunk * .3 + p.attrs.speed * .25,
    }));
    return { side, spec, players, score: 0 };
  });

  const my = config.myPlayer
    ? teams[config.myPlayer.side === "home" ? 0 : 1].players[config.myPlayer.index]
    : null;
  if (my) {
    /* the story runs through you: even a low-OVR rookie gets real touches */
    const team = teams[config.myPlayer.side === "home" ? 0 : 1];
    const teamAvg = team.players.reduce((s, p) => s + p.usage, 0) / team.players.length;
    my.usage = Math.max(my.usage, teamAvg * 0.95);
  }

  const highlights = [];
  const note = (type, player, teamIdx, detail) => {
    if (highlights.length < 60) highlights.push({
      t: Math.round(state.elapsed), type,
      playerId: player.spec.id, playerName: player.spec.name,
      side: SIDE_LABELS[teamIdx], ...(detail ? { detail } : {}),
    });
  };

  const state = { elapsed: 0, period: 0, periodScores: [], offense: rng.int(0, 2) };

  /* pace: seconds per possession — half court games grind, small sides fly */
  const basePoss = config.court === "half" ? 15 : 13;

  const timed = rules.mode === "timed";
  const periodLen = rules.quarterLength;
  const totalPeriods = rules.quarters;

  let periodClock = timed ? periodLen : Infinity;
  let periodHome0 = 0, periodAway0 = 0;

  const pointsFor = (shotType) => {
    if (rules.scoring === "ones-and-twos") return shotType === "THREE" ? 2 : 1;
    return shotType === "THREE" ? 3 : 2;
  };

  const done = () => {
    if (timed) {
      if (state.period < totalPeriods - 1) return false;
      if (periodClock > 0) return false;
      return teams[0].score !== teams[1].score ? true : false; // ties -> OT below
    }
    const [a, b] = [teams[0].score, teams[1].score];
    const t = rules.targetScore, w = rules.winBy || 1;
    return (a >= t || b >= t) && Math.abs(a - b) >= w;
  };

  const rollPeriod = () => {
    state.periodScores.push({ home: teams[0].score - periodHome0, away: teams[1].score - periodAway0 });
    periodHome0 = teams[0].score; periodAway0 = teams[1].score;
    state.period++;
    periodClock = state.period < totalPeriods ? periodLen : 60; // OT = 60s periods
  };

  /* ---- one possession ---------------------------------------------------- */
  function possession() {
    const off = teams[state.offense], def = teams[1 - state.offense];
    const oPlayers = off.players, dPlayers = def.players;

    let t = basePoss + rng.range(-5, 6);
    t = Math.max(4, Math.min(rules.shotClock || 24, t));
    state.elapsed += t;
    if (timed) periodClock -= t;

    /* turnover check: team handle vs team hands */
    const handle = avg(oPlayers, p => p.spec.attrs.pas) * .6 + avg(oPlayers, p => p.spec.attrs.speed) * .2;
    const stealer = pickBy(dPlayers, p => p.spec.attrs.steal + rng.float() * .3);
    let stealCh = (0.055 + avg(dPlayers, p => p.spec.attrs.steal) * 0.10 - handle * 0.055);
    stealCh *= badgeMultiplier(stealer.spec.badges, "steal.chance", { onBall: true });
    if (sides === 1) stealCh *= 0.6; // no passing lanes in 1v1
    if (rng.chance(Math.max(0.02, stealCh))) {
      const victim = pickBy(oPlayers, p => p.usage + rng.float());
      stealer.line.stl++; victim.line.tov++;
      if (stealer.spec.attrs.steal > .8 || stealer === my) note("steal", stealer, 1 - state.offense);
      state.offense = 1 - state.offense;
      return;
    }

    /* shooter + shot type: usage-weighted, superlinear so stars eat more */
    const shooter = rng.weighted(oPlayers, oPlayers.map(p => p.usage * p.usage));
    const a = shooter.spec.attrs;
    const wDunk = Math.max(0, a.dunk - .35) * (config.court === "half" ? .8 : 1.1);
    const wLayup = a.close * .8 + a.speed * .4;
    const wClose = a.close * .6;
    const wMid = a.mid * .8;
    const wThree = a.three * (sides <= 2 ? 1.0 : 1.25);
    const shotType = rng.weighted(
      ["DUNK", "LAYUP", "CLOSE", "MID", "THREE"],
      [wDunk, wLayup, wClose, wMid, wThree]);

    /* defense: matchup by index when possible, else nearest-role */
    const idx = oPlayers.indexOf(shooter);
    const defender = dPlayers[Math.min(idx, dPlayers.length - 1)];
    const dA = defender.spec.attrs;

    /* contest: how open is the look (0 smothered .. 1 wide open) */
    let open = rng.range(0.15, 1);
    open *= 1 - (dA.speed * .18 + dA.block * .1);
    open *= badgeMultiplier(defender.spec.badges, "def.window", {});

    /* dribble-move shake before the shot: breaking ankles buys openness */
    if ((shotType === "MID" || shotType === "THREE" || shotType === "CLOSE") && rng.chance(0.25)) {
      let breakCh = 0.3 + a.speed * .35 - dA.steal * .2;
      breakCh *= badgeMultiplier(shooter.spec.badges, "move.break", {});
      if (rng.chance(Math.max(.05, breakCh))) {
        open = Math.min(1, open + .35);
        if (rng.chance(.3)) note("ankle_break", shooter, state.offense);
      }
    }

    const contested = open < 0.45;
    const deep = shotType === "THREE" && rng.chance(0.3);

    /* block attempt on rim shots */
    if (shotType === "DUNK" || shotType === "LAYUP" || shotType === "CLOSE") {
      let blockCh = 0.04 + dA.block * 0.10 * (contested ? 1.5 : .7);
      blockCh *= badgeMultiplier(defender.spec.badges, "block.chance", {});
      if (rng.chance(blockCh)) {
        defender.line.blk++;
        shooter.line.fga++;
        note("block", defender, 1 - state.offense);
        if (rng.chance(.5)) { state.offense = 1 - state.offense; }
        return;
      }
    }

    /* make probability — same shape as the playable game's startShot() */
    const skillMap = { DUNK: a.dunk, LAYUP: a.close, CLOSE: a.close, FLOATER: (a.close + a.mid) / 2, MID: a.mid, THREE: a.three };
    let pct = SHOT_BASE[shotType] * (.55 + .45 * skillMap[shotType]) * (0.5 + 0.6 * open);
    if (deep) pct *= .82;
    pct *= badgeMultiplier(shooter.spec.badges, "shot.pct", { shotType, contested, deep });
    if (shotType === "DUNK" || shotType === "LAYUP")
      pct *= badgeMultiplier(shooter.spec.badges, "finish.pct", { dunk: shotType === "DUNK", traffic: contested });
    if (state.offense === 1) pct *= DIFF_PCT[config.difficulty]; // away = CPU dial
    pct = Math.max(.03, Math.min(.97, pct));

    shooter.line.fga++;
    if (shotType === "THREE") shooter.line.tpa++;

    if (rng.chance(pct)) {
      const pts = pointsFor(shotType);
      shooter.line.fgm++;
      shooter.line.pts += pts;
      if (shotType === "THREE") shooter.line.tpm++;
      if (shotType === "DUNK") {
        shooter.line.dunks++;
        note(contested ? "poster_dunk" : "dunk", shooter, state.offense);
      } else if (shotType === "THREE" && (deep || shooter === my) && rng.chance(.4)) {
        note("splash", shooter, state.offense);
      }
      off.score += pts;

      /* assist: someone created this look */
      if (sides > 1 && (shotType !== "DUNK" || rng.chance(.5))) {
        const passers = oPlayers.filter(p => p !== shooter);
        if (passers.length) {
          const passer = pickBy(passers, p => p.spec.attrs.pas + rng.float() * .4);
          let assistCh = 0.45 + passer.spec.attrs.pas * .35;
          assistCh *= badgeMultiplier(passer.spec.badges, "pass.assist", {});
          if (rng.chance(Math.min(.92, assistCh))) passer.line.ast++;
        }
      }
      state.offense = 1 - state.offense;
      return;
    }

    /* miss -> rebound battle */
    const orbWeight = sum(oPlayers, p => p.spec.attrs.reb * badgeMultiplier(p.spec.badges, "reb.range", {})) * 0.42;
    const drbWeight = sum(dPlayers, p => p.spec.attrs.reb * badgeMultiplier(p.spec.badges, "reb.range", {}));
    const offBoard = rng.chance(orbWeight / (orbWeight + drbWeight));
    const pool = offBoard ? oPlayers : dPlayers;
    const rebounder = pickBy(pool, p => p.spec.attrs.reb * badgeMultiplier(p.spec.badges, "reb.range", {}) + rng.float() * .35);
    rebounder.line.reb++;
    if (offBoard) {
      rebounder.line.oreb++;
    } else {
      state.offense = 1 - state.offense;
    }
  }

  /* ---- run the match ------------------------------------------------------ */
  let guard = 0;
  if (timed) {
    while (guard++ < 5000) {
      possession();
      if (periodClock <= 0) {
        if (state.period >= totalPeriods - 1 && teams[0].score !== teams[1].score) { rollPeriod(); break; }
        rollPeriod();
      }
      if (state.periodScores.length > 12) break; // absurd-OT failsafe
    }
  } else {
    while (!done() && guard++ < 3000) possession();
    state.periodScores.push({ home: teams[0].score, away: teams[1].score });
  }

  /* ---- assemble MatchResult ---------------------------------------------- */
  const score = { home: teams[0].score, away: teams[1].score };
  const winner = score.home >= score.away ? "home" : "away"; // home wins exact ties (failsafe only)

  let myPlayerResult = null;
  if (my) {
    const mySide = config.myPlayer.side;
    const teamWon = winner === mySide;
    const { score: gradeScore, grade } = gradePerformance(my.line, { teamWon, sides });
    myPlayerResult = {
      line: my.line, grade, gradeScore, teamWon,
      objectives: evaluateObjectives(config.objectives, my.line, { teamWon, gradeScore }),
    };
  }

  return {
    schema: CONTRACT_SCHEMA,
    engine: "headless",
    seed: config.seed,
    score, winner,
    periods: state.periodScores,
    boxScore: { home: teams[0].players.map(p => p.line), away: teams[1].players.map(p => p.line) },
    myPlayer: myPlayerResult,
    highlights,
    duration: Math.round(state.elapsed),
    meta: config.meta || {},
  };
}

/* ---- tiny helpers ---- */
function avg(arr, f) { return arr.reduce((s, x) => s + f(x), 0) / arr.length; }
function sum(arr, f) { return arr.reduce((s, x) => s + f(x), 0); }
function pickBy(arr, f) {
  let best = arr[0], bs = -Infinity;
  for (const x of arr) { const v = f(x); if (v > bs) { bs = v; best = x; } }
  return best;
}
