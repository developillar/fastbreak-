/* Career life layer: energy, bonds, training, rest, headlines, stats. */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  startCareer, currentEvent, completeScene, careerGameConfig, recordGame,
  careerTeams, ensureCareerLife, addMeters, runTraining, restDay,
  canTrain, canRest, formOf, DRILLS,
} from "../src/career/career.js";
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
function toFirstGame(save) {
  completeScene(save, null);   // ch0-open -> ch0-run
  return currentEvent(save.career);
}

test("life backfills onto old careers", () => {
  const save = freshSave();
  delete save.career.life;
  const L = ensureCareerLife(save);
  assert.equal(L.energy, 100);
  assert.equal(L.trainAvail, 1);
  assert.ok(Array.isArray(L.news));
});

test("meters clamp to 0..100", () => {
  const save = freshSave();
  addMeters(save, { coach: 500, fans: -500, energy: -500 });
  const L = save.career.life;
  assert.equal(L.coach, 100);
  assert.equal(L.fans, 0);
  assert.equal(L.energy, 0);
});

test("played game drains energy, moves bonds, logs stats + a headline", () => {
  const save = freshSave(11);
  toFirstGame(save);
  const L = ensureCareerLife(save);
  const e0 = L.energy;
  // win the must-win (bounded attempts, deterministic reseeds)
  for (let i = 0; i < 25; i++) {
    const res = simulate(careerGameConfig(save, league));
    const r = recordGame(save, res, { league });
    if (r.advanced) break;
  }
  assert.ok(L.energy < e0, "energy spent");
  assert.ok(L.stats.gp >= 1, "gp counted");
  assert.ok(L.news.length >= 1, "headline pushed");
  assert.ok(L.stats.grades.length >= 1, "grade tracked");
  assert.equal(typeof formOf(save), "number");
});

test("coach/fan bonds pay reward bonuses", () => {
  const a = freshSave(21), b = freshSave(21);
  toFirstGame(a); toFirstGame(b);
  ensureCareerLife(a); ensureCareerLife(b);
  a.career.life.coach = 0;  a.career.life.fans = 0;
  b.career.life.coach = 100; b.career.life.fans = 100;
  const ra = recordGame(a, simulate(careerGameConfig(a, league)), { league });
  const rb = recordGame(b, simulate(careerGameConfig(b, league)), { league });
  assert.ok(rb.earned.up >= ra.earned.up, "coach trust boosts UP");
  assert.ok(rb.earned.rep >= ra.earned.rep, "fan love boosts rep");
});

test("training banks UP, spends a session and energy", () => {
  const save = freshSave();
  const L = ensureCareerLife(save);
  const up0 = save.myPlayer.up;
  assert.ok(canTrain(save));
  const r = runTraining(save, DRILLS[0].id);
  assert.ok(r.up >= 4, "meaningful UP gain");
  assert.equal(save.myPlayer.up, up0 + r.up);
  assert.equal(L.trainAvail, 0);
  assert.ok(L.energy < 100);
  assert.ok(!canTrain(save), "no session left");
  assert.throws(() => runTraining(save, "shoot"));
});

test("rest is gated and restores energy", () => {
  const save = freshSave();
  const L = ensureCareerLife(save);
  assert.ok(!canRest(save), "fresh legs can't rest");
  assert.throws(() => restDay(save));
  L.energy = 30;
  assert.ok(canRest(save));
  restDay(save);
  assert.equal(L.energy, 65);
});

test("tired legs play at a discount", () => {
  const save = freshSave(31);
  toFirstGame(save);
  const L = ensureCareerLife(save);
  L.energy = 100;
  const fresh = careerTeams(save, league);
  L.energy = 20;
  const tired = careerTeams(save, league);
  const slot = fresh.slot;
  assert.ok(tired.home.lineup[slot].attrs.speed < fresh.home.lineup[slot].attrs.speed,
    "speed reduced when gassed");
  assert.equal(tired.home.lineup[slot].attrs.height, fresh.home.lineup[slot].attrs.height,
    "height untouched");
});

test("story choices can move the bonds", () => {
  const save = freshSave();
  const L = ensureCareerLife(save);
  const fans0 = L.fans;
  completeScene(save, null);                    // ch0-open (no choice)
  // fast-forward: win THE RUN, then take the 'hungry' choice (fans +4)
  for (let i = 0; i < 25; i++) {
    const r = recordGame(save, simulate(careerGameConfig(save, league)), { league });
    if (r.advanced) break;
  }
  completeScene(save, "hungry");                // THE CARD choice
  assert.ok(L.fans > fans0, "fans moved by the choice");
});
