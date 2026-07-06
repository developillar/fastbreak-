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
export function recordGame(save, result, { simmed = false } = {}) {
  const c = save.career;
  const cur = currentEvent(c);
  if (cur.done || cur.event.type !== "game") throw new Error("Current event is not a game");
  const ev = cur.event;
  const my = result.myPlayer || {};
  const won = !!my.teamWon;

  const earned = applyMatchRewards(save.myPlayer, result, simmed ? 0.6 : 1);
  c.history.push({
    type: "game", id: ev.id, label: ev.label,
    score: result.score, won, simmed,
    grade: my.grade, gradeScore: my.gradeScore,
    objectives: (my.objectives || []).filter(o => o.met).length,
  });
  if (won) c.record.w++; else c.record.l++;
  if (ev.opponent === "rival") c.rivalMeter += won ? 2 : 1;

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
  advance(save);
  return { w, l, up, rep };
}

export { STORY, RIVAL };
