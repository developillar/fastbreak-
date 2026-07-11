/* =============================================================================
   MYCAREER ENGINE — walks the STORY data (story.js) event by event.
   No narrative lives here: scenes, games, choices and chapters are all data.

   Loop per the design doc: story beat -> pre-game objectives -> play/sim ->
   grade + rewards -> upgrade -> next beat.

   Career state (inside the save blob):
     { seed, chapterIndex, eventIndex, attempt, teamId, flags:{}, choices:{},
       seenScenes:[], history:[], record:{w,l}, rivalMeter, pending }
   ========================================================================== */

import { STORY, RIVAL } from "./story.js";
import { makeMatchConfig } from "../core/contract.js";
import { toTeamSpec, teamOvr } from "../core/league.js";
import { toPlayerSpec, applyMatchRewards } from "../player/myplayer.js";
import { POSITIONS } from "../player/archetypes.js";
import { Rng, hashSeed } from "../core/rng.js";
import { simulate } from "../engine/headless.js";

export function startCareer(save, { seed = 1 } = {}) {
  if (!save.myPlayer) throw new Error("Create a MyPlayer first");
  save.career = {
    seed: seed >>> 0,
    chapterIndex: 0,
    eventIndex: 0,
    attempt: 0,
    teamId: null,          // assigned on draft night
    flags: {},
    choices: {},
    seenScenes: [],
    history: [],
    record: { w: 0, l: 0 },
    rivalMeter: 0,
    pending: null,         // set while a playable key game is in flight
  };
  processOnEnter(save);
  return save.career;
}

/* ---------------- event cursor ---------------- */
export function currentEvent(career) {
  const ch = STORY[career.chapterIndex];
  if (!ch) return { done: true };
  return {
    done: false,
    chapter: ch,
    chapterIndex: career.chapterIndex,
    event: ch.events[career.eventIndex],
    eventIndex: career.eventIndex,
  };
}

export function advance(save) {
  const c = save.career;
  c.attempt = 0;
  c.eventIndex++;
  const ch = STORY[c.chapterIndex];
  if (ch && c.eventIndex >= ch.events.length) {
    c.chapterIndex++;
    c.eventIndex = 0;
  }
  // skip scenes whose `requires` flag was never earned
  const cur = currentEvent(c);
  if (!cur.done && cur.event.type === "scene" && cur.event.requires && !c.flags[cur.event.requires]) {
    return advance(save);
  }
  processOnEnter(save);
  return currentEvent(c);
}

function processOnEnter(save) {
  const c = save.career;
  const cur = currentEvent(c);
  if (!cur.done && cur.event.type === "scene" && cur.event.onEnter === "draft" && !c.teamId) {
    c.teamId = pickDraftTeam(save);
  }
}

/* ---------------- scenes ---------------- */
export function completeScene(save, choiceId = null) {
  const c = save.career;
  const cur = currentEvent(c);
  if (cur.done || cur.event.type !== "scene") throw new Error("Current event is not a scene");
  const scene = cur.event;
  c.seenScenes.push(scene.id);
  if (scene.choice) {
    const opt = scene.choice.options.find(o => o.id === choiceId) || scene.choice.options[0];
    c.choices[scene.id] = opt.id;
    applyEffects(save, opt.effects);
  }
  return advance(save);
}

function applyEffects(save, effects = {}) {
  const mp = save.myPlayer, c = save.career;
  if (effects.rep) mp.rep += effects.rep;
  if (effects.up) mp.up += effects.up;
  if (effects.flag) c.flags[effects.flag] = true;
  if (effects.rival) c.rivalMeter += effects.rival;
  addMeters(save, effects);   // choices can move coach/fans/chem/energy too
}

/* =============================================================================
   CAREER LIFE — the Retro Bowl layer: energy, bonds, training, headlines.

   life = { energy 0..100, coach/fans/chem 0..100, trainAvail, trainings,
            stats {gp,pts,reb,ast,stl,blk,bestPts,grades[]}, news[] }

   Effects on the game (small, legible):
     - energy < 35: key attributes play at 93% until you rest
     - coach trust pays a UP bonus on game rewards (up to +33%)
     - fan love pays a Rep bonus on game rewards (up to +40%)
     - training converts energy + a session into banked UP (coach helps)
   ========================================================================== */
export const METERS = [
  { key: "coach", label: "COACH TRUST" },
  { key: "fans",  label: "FANS" },
  { key: "chem",  label: "CHEMISTRY" },
];
export const DRILLS = [
  { id: "shoot",  label: "SHOOTING",   blurb: "500 makes before lunch." },
  { id: "finish", label: "FINISHING",  blurb: "Rim runs and contact layups." },
  { id: "defense",label: "DEFENSE",    blurb: "Slides until your legs shake." },
  { id: "play",   label: "PLAYMAKING", blurb: "Film, reads, pocket passes." },
];
const cl100 = v => Math.max(0, Math.min(100, Math.round(v)));

export function ensureCareerLife(save) {
  const c = save.career;
  if (!c) return null;
  if (!c.life) {
    c.life = {
      energy: 100, coach: 50, fans: 30, chem: 50,
      trainAvail: 1, trainings: 0,
      stats: { gp: 0, pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, bestPts: 0, grades: [] },
      news: [],
    };
  }
  return c.life;
}
export function addMeters(save, d = {}) {
  const L = ensureCareerLife(save);
  if (!L) return;
  for (const k of ["coach", "fans", "chem"]) if (d[k]) L[k] = cl100(L[k] + d[k]);
  if (d.energy) L.energy = cl100(L.energy + d.energy);
}
export function pushNews(save, text) {
  const L = ensureCareerLife(save);
  if (!L) return;
  L.news.unshift(text);
  if (L.news.length > 12) L.news.length = 12;
}
export function canTrain(save) {
  const L = ensureCareerLife(save);
  return !!L && L.trainAvail > 0 && L.energy >= 15;
}
export function runTraining(save, drillId) {
  const L = ensureCareerLife(save);
  if (!L.trainAvail) throw new Error("No training session banked — play a game first");
  if (L.energy < 15) throw new Error("Too tired to train — take a rest day");
  L.trainAvail--; L.trainings++;
  L.energy = cl100(L.energy - 15);
  const drill = DRILLS.find(d => d.id === drillId) || DRILLS[0];
  const rng = new Rng(hashSeed(save.career.seed + ":train:" + L.trainings));
  const up = 4 + rng.int(0, 4) + Math.round(L.coach / 25);   // 4..12, coach helps
  save.myPlayer.up += up;
  L.coach = cl100(L.coach + 1);
  pushNews(save, `${drill.label} SESSION — +${up} UP BANKED`);
  return { up, drill };
}
export function canRest(save) {
  const L = ensureCareerLife(save);
  return !!L && L.energy < 70;
}
export function restDay(save) {
  const L = ensureCareerLife(save);
  if (L.energy >= 70) throw new Error("Already fresh");
  L.energy = cl100(L.energy + 35);
  L.chem = cl100(L.chem + 1);
  pushNews(save, "REST DAY — LEGS BACK UNDER YOU");
  return L.energy;
}
/* rolling form from the last few grades: -1 cold, 0 steady, 1 hot */
export function formOf(save) {
  const L = ensureCareerLife(save);
  const g = L?.stats.grades.slice(-3) || [];
  if (g.length < 2) return 0;
  const avg = g.reduce((a, b) => a + b, 0) / g.length;
  return avg >= 68 ? 1 : avg <= 45 ? -1 : 0;
}
function headlineFor(save, ctx, line, won, ev, rng) {
  const n = (save.myPlayer.name || "YOU").split(" ").pop();
  if (line && line.pts >= 18) return `${n} ERUPTS FOR ${line.pts} — ${ctx.teamAbbr} ${won ? "ROLL" : "WASTE IT"}`;
  if (line && line.pts >= 10 && won) return `${n} DROPS ${line.pts}, ${ctx.teamAbbr} HANDLE ${ev.opponent === "rival" ? RIVAL.team : "BUSINESS"}`;
  if (won && ev.opponent === "rival") return `${ctx.teamAbbr} SILENCE ${RIVAL.name} IN PRIME TIME`;
  if (won) return rng.pick([`${ctx.teamAbbr} GRIND ONE OUT`, `${n} & CO. TAKE CARE OF HOME`, `W'S THE ONLY STAT — ${ctx.teamAbbr} WIN`]);
  if (ev.mustWin) return `${ctx.teamAbbr} STUNNED — RUN IT BACK`;
  return rng.pick([`TOUGH NIGHT FOR ${n}`, `${ctx.teamAbbr} DROP A CLOSE ONE`, `BACK TO THE LAB FOR ${n}`]);
}

/* ---------------- line templating ---------------- */
export function careerContext(save, league) {
  const c = save.career;
  if (c?.teamId && typeof c.teamId === "object") resolveDraft(save, league);
  const team = c?.teamId != null ? league.find(t => t.id === c.teamId) : null;
  return {
    name: save.myPlayer?.name || "YOU",
    team: team ? team.city + " " + team.name : "PROSPECTS",
    teamAbbr: team ? team.abbr : "PRO",
    city: team ? team.city : "THE CITY",
    rival: RIVAL.name,
  };
}
export function interpolate(text, ctx) {
  return String(text).replace(/\{(\w+)\}/g, (m, k) => (ctx[k] != null ? ctx[k] : m));
}

/* ---------------- teams ---------------- */
function pickDraftTeam(save) {
  // better showcase grades -> stronger franchise wants you
  const c = save.career;
  const grades = c.history.filter(h => h.type === "game").map(h => h.gradeScore ?? 50);
  const avg = grades.length ? grades.reduce((a, b) => a + b, 0) / grades.length : 50;
  return { avg }; // resolved against the league by careerTeamId (needs league)
}
/* draft resolution needs the league, so the id is computed lazily */
export function resolveDraft(save, league) {
  const c = save.career;
  if (typeof c.teamId === "string") return c.teamId;
  const avg = c.teamId && typeof c.teamId === "object" ? c.teamId.avg : 50;
  const ranked = [...league].sort((a, b) => teamOvr(a) - teamOvr(b)); // weakest first
  // great combine -> contender; rough combine -> rebuilding squad. Rival's
  // team is never yours.
  const pool = ranked.filter(t => t.abbr !== RIVAL.team);
  const idx = Math.min(pool.length - 1, Math.floor(((avg - 35) / 50) * pool.length));
  c.teamId = pool[Math.max(0, idx)].id;
  return c.teamId;
}

function streetTeam(league, seed, name, abbr, excludeIds = []) {
  const rng = new Rng(seed);
  const lineup = [];
  for (let role = 0; role < 5; role++) {
    let p = null, guard = 0;
    while (guard++ < 40) {
      const t = rng.pick(league);
      const cand = t.lineup[role];
      if (!excludeIds.includes(cand.id) && !lineup.some(x => x.id === cand.id)) { p = cand; break; }
    }
    lineup.push({ ...(p || league[0].lineup[role]), id: abbr.toLowerCase() + "-" + role });
  }
  return {
    id: "team-" + abbr.toLowerCase(),
    name, abbr,
    colors: { primary: 0x3a4150, secondary: 0x15181f, ui: "#aeb9c9" },
    lineup,
  };
}

export function careerTeams(save, league) {
  const c = save.career;
  if (c.teamId && typeof c.teamId === "object") resolveDraft(save, league);
  const cur = currentEvent(c);
  const ev = cur.event;
  const seedBase = hashSeed(c.seed + ":" + cur.chapterIndex + ":" + cur.eventIndex);

  // my squad: pre-draft it's a street/prospect squad, post-draft the franchise
  let home;
  if (c.teamId && typeof c.teamId === "string") {
    const t = league.find(x => x.id === c.teamId);
    home = toTeamSpec(t);
  } else {
    home = streetTeam(league, seedBase + 1, "PROSPECTS", "PRO");
  }
  const spec = toPlayerSpec(save.myPlayer);
  const slot = Math.max(0, POSITIONS.indexOf(save.myPlayer.position));
  home.lineup = home.lineup.slice();
  home.lineup[slot] = spec;
  // heavy legs: below 35 energy the engine gets a 93% version of you
  const L = c.life;
  if (L && L.energy < 35) {
    const a = { ...spec.attrs };
    for (const k of ["speed", "three", "mid", "close", "dunk"]) a[k] = Math.max(.1, a[k] * .93);
    home.lineup[slot] = { ...spec, attrs: a };
  }

  // opponent
  let away;
  const opp = ev && ev.opponent;
  if (opp === "rival") {
    away = toTeamSpec(league.find(t => t.abbr === RIVAL.team) || league[0]);
  } else if (opp === "street") {
    away = streetTeam(league, seedBase + 2, "RUN BACK", "RUN", home.lineup.map(p => p.id));
  } else if (opp && opp !== "any") {
    away = toTeamSpec(league.find(t => t.abbr === opp) || league[0]);
  } else {
    const rng = new Rng(seedBase + 3);
    const pool = league.filter(t => t.id !== c.teamId);
    away = toTeamSpec(rng.pick(pool));
  }
  return { home, away, slot };
}

/* ---------------- key games ---------------- */
export function careerGameConfig(save, league) {
  const c = save.career;
  const cur = currentEvent(c);
  if (cur.done || cur.event.type !== "game") throw new Error("Current event is not a game");
  const ev = cur.event;
  const { home, away, slot } = careerTeams(save, league);
  return makeMatchConfig({
    seed: hashSeed(c.seed + ":" + ev.id + ":" + c.attempt),
    home, away,
    difficulty: ev.difficulty ?? 1,
    rules: { quarterLength: save.settings?.qlen || 120 },
    myPlayer: { side: "home", index: slot },
    objectives: ev.objectives || [],
    meta: { label: ev.label + (ev.opponent === "rival" ? " vs " + RIVAL.name : ""), career: true,
            venue: ev.venue === "street" ? "park" : null },
  });
}

/* record a finished key game; returns {advanced, retry, earned} */
export function recordGame(save, result, { simmed = false, league = null } = {}) {
  const c = save.career;
  const cur = currentEvent(c);
  if (cur.done || cur.event.type !== "game") throw new Error("Current event is not a game");
  const ev = cur.event;
  const my = result.myPlayer || {};
  const won = !!my.teamWon;
  const L = ensureCareerLife(save);

  const earned = applyMatchRewards(save.myPlayer, result, simmed ? 0.6 : 1);
  // bonds pay out: coach trust boosts UP, fan love boosts Rep
  const bonus = {
    up: Math.round(earned.up * (L.coach / 300)),
    rep: Math.round(earned.rep * (L.fans / 250)),
  };
  save.myPlayer.up += bonus.up;
  save.myPlayer.rep += bonus.rep;
  earned.up += bonus.up; earned.rep += bonus.rep;

  c.history.push({
    type: "game", id: ev.id, label: ev.label,
    score: result.score, won, simmed,
    grade: my.grade, gradeScore: my.gradeScore,
    objectives: (my.objectives || []).filter(o => o.met).length,
  });
  if (won) c.record.w++; else c.record.l++;
  if (ev.opponent === "rival") c.rivalMeter += won ? 2 : 1;

  /* life: energy spend, bond swings, stats, a headline for the feed */
  const objAll = (my.objectives || []).length > 0 && (my.objectives || []).every(o => o.met);
  const gScore = my.gradeScore ?? 50;
  addMeters(save, {
    energy: simmed ? -10 : -26,
    coach: (won ? 4 : -3) + (objAll ? 2 : 0) + (gScore >= 75 ? 2 : 0),
    fans:  (won ? (simmed ? 2 : 5) : -2) + (gScore >= 75 ? 3 : 0),
    chem:  won ? 3 : -2,
  });
  L.trainAvail = Math.min(2, L.trainAvail + 1);
  const line = (result.boxScore?.home || []).find(l => l.id === "myplayer") || null;
  if (line) {
    const s = L.stats;
    s.gp++; s.pts += line.pts; s.reb += line.reb; s.ast += line.ast;
    s.stl += line.stl; s.blk += line.blk;
    s.bestPts = Math.max(s.bestPts, line.pts);
    s.grades.push(gScore);
    if (s.grades.length > 20) s.grades.shift();
  }
  const ctx = league ? careerContext(save, league)
                     : { teamAbbr: "PRO", name: save.myPlayer.name };
  pushNews(save, headlineFor(save, ctx, line, won,
    ev, new Rng(hashSeed(c.seed + ":news:" + c.history.length))));

  if (ev.mustWin && !won) {
    c.attempt++;          // reseeds the rematch
    return { advanced: false, retry: true, earned };
  }
  advance(save);
  return { advanced: true, retry: false, earned };
}

/* ---------------- sim blocks ---------------- */
export function runSimBlock(save, league) {
  const c = save.career;
  const cur = currentEvent(c);
  if (cur.done || cur.event.type !== "sim") throw new Error("Current event is not a sim block");
  const ev = cur.event;
  const { home, slot } = careerTeams(save, league);
  const rng = new Rng(hashSeed(c.seed + ":" + ev.id));
  let w = 0, l = 0, up = 0, rep = 0;
  for (let i = 0; i < ev.count; i++) {
    const pool = league.filter(t => t.id !== c.teamId);
    const away = toTeamSpec(pool[rng.int(0, pool.length)]);
    const cfg = makeMatchConfig({
      seed: hashSeed(c.seed + ":" + ev.id + ":" + i),
      home, away,
      difficulty: 1,
      rules: { quarterLength: 120 },
      myPlayer: { side: "home", index: slot },
      meta: { label: ev.label, career: true },
    });
    const res = simulate(cfg);
    const earned = applyMatchRewards(save.myPlayer, res, 0.35);
    up += earned.up; rep += earned.rep;
    if (res.myPlayer.teamWon) { w++; c.record.w++; } else { l++; c.record.l++; }
  }
  c.history.push({ type: "sim", id: ev.id, label: ev.label, w, l });
  addMeters(save, { energy: -12, chem: 2, fans: w > l ? 3 : 0, coach: w > l ? 2 : -1 });
  const Ls = ensureCareerLife(save);
  Ls.trainAvail = Math.min(2, Ls.trainAvail + 1);
  pushNews(save, `${ev.label}: ${w}W ${l}L ACROSS THE STRETCH`);
  advance(save);
  return { w, l, up, rep };
}

export { STORY, RIVAL };
