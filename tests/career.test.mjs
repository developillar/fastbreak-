import { test } from "node:test";
import assert from "node:assert/strict";
import {
  startCareer, currentEvent, completeScene, careerGameConfig, recordGame,
  runSimBlock, careerContext, interpolate, resolveDraft, STORY, RIVAL,
} from "../src/career/career.js";
import { validateMatchConfig } from "../src/core/contract.js";
import { simulate } from "../src/engine/headless.js";
import { buildLeague } from "../src/core/league.js";
import { createMyPlayer } from "../src/player/myplayer.js";
import { defaultSave } from "../src/save/store.js";

const league = buildLeague();

function freshSave(seed = 7) {
  const save = defaultSave();
  save.myPlayer = createMyPlayer({ name: "Rook", position: "SG", archetypeId: "slasher" });
  startCareer(save, { seed });
  return save;
}

test("story data is well-formed", () => {
  assert.ok(STORY.length >= 7, "seven chapters");
  const ids = new Set();
  for (const ch of STORY) {
    assert.ok(ch.id && ch.title && Array.isArray(ch.events) && ch.events.length > 0, ch.id);
    for (const ev of ch.events) {
      assert.ok(!ids.has(ev.id), "duplicate event id " + ev.id);
      ids.add(ev.id);
      assert.ok(["scene", "game", "sim"].includes(ev.type), ev.id);
      if (ev.type === "scene") assert.ok(ev.lines.length > 0 && ev.lines.every(l => l.speaker && l.text), ev.id);
      if (ev.type === "game") assert.ok(ev.label && ev.opponent, ev.id);
      if (ev.type === "sim") assert.ok(ev.count >= 1, ev.id);
    }
  }
  assert.ok(league.some(t => t.abbr === RIVAL.team), "rival team exists in league");
});

test("career starts at the first scene", () => {
  const save = freshSave();
  const cur = currentEvent(save.career);
  assert.equal(cur.chapterIndex, 0);
  assert.equal(cur.event.type, "scene");
  assert.equal(cur.event.id, "ch0-open");
});

test("completing a scene advances; choices apply effects and stick", () => {
  const save = freshSave();
  completeScene(save);                       // ch0-open (no choice)
  let cur = currentEvent(save.career);
  assert.equal(cur.event.type, "game");
  // jump the game via a simulated result to reach the choice scene
  const cfg = careerGameConfig(save, league);
  let res, seed = 0;
  do { res = simulate({ ...cfg, seed: seed++ }); } while (!res.myPlayer.teamWon && seed < 60);
  recordGame(save, res);
  cur = currentEvent(save.career);
  assert.equal(cur.event.id, "ch0-after");
  const repBefore = save.myPlayer.rep;
  completeScene(save, "cool");
  assert.equal(save.career.choices["ch0-after"], "cool");
  assert.equal(save.career.flags.cool, true);
  assert.ok(save.myPlayer.rep > repBefore, "choice rep granted");
});

test("career game config is contract-valid with MyPlayer slotted", () => {
  const save = freshSave();
  completeScene(save);
  const cfg = careerGameConfig(save, league);
  assert.ok(validateMatchConfig(cfg));
  assert.equal(cfg.home.lineup[cfg.myPlayer.index].id, "myplayer");
  assert.ok(cfg.objectives.length > 0);
  assert.ok(cfg.meta.career);
});

test("mustWin games retry on a loss with a reseeded rematch", () => {
  const save = freshSave();
  completeScene(save);
  const cfg1 = careerGameConfig(save, league);
  let res, seed = 0;
  do { res = simulate({ ...cfg1, seed: seed++ }); } while (res.myPlayer.teamWon && seed < 60);
  assert.equal(res.myPlayer.teamWon, false, "found a losing sim");
  const r = recordGame(save, res);
  assert.equal(r.retry, true);
  assert.equal(currentEvent(save.career).event.id, "ch0-run", "still on the same game");
  const cfg2 = careerGameConfig(save, league);
  assert.notEqual(cfg1.seed, cfg2.seed, "rematch is reseeded");
});

test("template interpolation resolves career context", () => {
  const save = freshSave();
  const ctx = careerContext(save, league);
  assert.equal(interpolate("{name} of the {team}", ctx), "ROOK of the PROSPECTS");
  save.career.teamId = league[0].id;
  const ctx2 = careerContext(save, league);
  assert.ok(interpolate("{team}", ctx2).includes(league[0].name));
});

test("full career walkthrough: every chapter completes, nothing wedges", () => {
  const save = freshSave(42);
  let guard = 0;
  const chaptersSeen = new Set();
  while (guard++ < 400) {
    const cur = currentEvent(save.career);
    if (cur.done) break;
    chaptersSeen.add(cur.chapter.id);
    if (cur.event.type === "scene") {
      completeScene(save, cur.event.choice ? cur.event.choice.options[0].id : null);
    } else if (cur.event.type === "game") {
      // find a winning seed so mustWin games always pass within the walk
      const base = careerGameConfig(save, league);
      let res, s = 0;
      do { res = simulate({ ...base, seed: base.seed + s++ }); }
      while (cur.event.mustWin && !res.myPlayer.teamWon && s < 80);
      recordGame(save, res, { simmed: true });
    } else if (cur.event.type === "sim") {
      runSimBlock(save, league);
    }
  }
  const c = save.career;
  assert.ok(currentEvent(c).done, "career reached the end (guard=" + guard + ")");
  assert.equal(chaptersSeen.size, STORY.length, "visited every chapter");
  assert.ok(typeof c.teamId === "string", "drafted to a league team");
  assert.notEqual(league.find(t => t.id === c.teamId).abbr, RIVAL.team, "never drafted to the rival's team");
  const games = STORY.flatMap(ch => ch.events).filter(e => e.type === "game").length;
  assert.ok(c.history.filter(h => h.type === "game").length >= games, "all key games recorded");
  const simBlocks = STORY.flatMap(ch => ch.events).filter(e => e.type === "sim");
  const simGames = simBlocks.reduce((s, e) => s + e.count, 0);
  assert.equal(c.record.w + c.record.l >= games + simGames, true, "record counts every game");
  assert.ok(c.rivalMeter > 0, "rivalry meter moved");
  assert.ok(save.myPlayer.rep > 0 && save.myPlayer.totals.games > 0, "rewards flowed");
  // the whole thing survives a JSON roundtrip (save blob invariant)
  const round = JSON.parse(JSON.stringify(save));
  assert.equal(round.career.chapterIndex, c.chapterIndex);
});

test("draft resolution maps combine grades to a team, deterministically", () => {
  const save = freshSave(9);
  save.career.teamId = { avg: 90 };
  const strong = resolveDraft(save, league);
  const save2 = freshSave(9);
  save2.career.teamId = { avg: 90 };
  assert.equal(resolveDraft(save2, league), strong, "deterministic");
  const save3 = freshSave(9);
  save3.career.teamId = { avg: 20 };
  const weak = resolveDraft(save3, league);
  assert.notEqual(strong, weak, "grades matter");
});

test("sim blocks aggregate wins/losses and pay scaled rewards", () => {
  const save = freshSave(11);
  // walk to the first sim block (ch3-sim1)
  let guard = 0;
  while (guard++ < 100) {
    const cur = currentEvent(save.career);
    if (cur.done) break;
    if (cur.event.type === "sim") break;
    if (cur.event.type === "scene") completeScene(save, cur.event.choice?.options[0].id);
    else {
      const base = careerGameConfig(save, league);
      let res, s = 0;
      do { res = simulate({ ...base, seed: base.seed + s++ }); }
      while (cur.event.mustWin && !res.myPlayer.teamWon && s < 80);
      recordGame(save, res, { simmed: true });
    }
  }
  const ev = currentEvent(save.career).event;
  assert.equal(ev.type, "sim");
  const upBefore = save.myPlayer.up;
  const r = runSimBlock(save, league);
  assert.equal(r.w + r.l, ev.count);
  assert.ok(save.myPlayer.up >= upBefore, "sim rewards paid");
  const entry = save.career.history.at(-1);
  assert.equal(entry.type, "sim");
  assert.equal(entry.w + entry.l, ev.count);
});
