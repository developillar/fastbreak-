import { test } from "node:test";
import assert from "node:assert/strict";
import {
  COURTS, courtById, parkGameConfig, recordParkGame, ensurePark,
  BotProvider, mySquad, tierOf, tierProgress, PARK_TIERS,
} from "../src/park/park.js";
import { validateMatchConfig, validateMatchResult } from "../src/core/contract.js";
import { simulate } from "../src/engine/headless.js";
import { buildLeague } from "../src/core/league.js";
import { createMyPlayer } from "../src/player/myplayer.js";
import { defaultSave } from "../src/save/store.js";

const league = buildLeague();
function freshSave() {
  const save = defaultSave();
  save.myPlayer = createMyPlayer({ name: "Rook", position: "SG", archetypeId: "slasher" });
  ensurePark(save);
  return save;
}

test("every court produces a contract-valid config with MyPlayer slotted", () => {
  const save = freshSave();
  for (const c of COURTS) {
    const cfg = parkGameConfig(save, league, c.id);
    assert.ok(validateMatchConfig(cfg), c.id);
    assert.equal(cfg.sides, c.sides);
    assert.equal(cfg.court, c.court);
    assert.equal(cfg.home.lineup[cfg.myPlayer.index].id, "myplayer", c.id);
    assert.equal(cfg.meta.park, c.id);
    if (c.rules.mode === "target") assert.equal(cfg.rules.targetScore, c.rules.targetScore);
  }
});

test("every court simulates end-to-end through the headless engine", () => {
  const save = freshSave();
  for (const c of COURTS) {
    const res = simulate(parkGameConfig(save, league, c.id));
    assert.ok(validateMatchResult(res), c.id);
    assert.ok(res.myPlayer, c.id + " myPlayer graded");
    if (c.rules.mode === "target") {
      assert.ok(Math.max(res.score.home, res.score.away) >= c.rules.targetScore, c.id);
    }
    save.park.plays++;   // fresh matchup next court
  }
});

test("FULL RUNS is the playable court: full-court 5v5", () => {
  const runs = courtById("runs");
  assert.equal(runs.playable, true);
  assert.equal(runs.sides, 5);
  assert.equal(runs.court, "full");
});

test("BotProvider scales opposition with rep", () => {
  const cage = courtById("stage");
  const avg = team => {
    let s = 0, n = 0;
    for (const p of team.lineup) for (const k in p.attrs) {
      if (k !== "height") { s += p.attrs[k]; n++; }
    }
    return s / n;
  };
  const rookie = avg(BotProvider.getOpponent(league, cage, 0, 7));
  const legend = avg(BotProvider.getOpponent(league, cage, 6500, 7));
  assert.ok(legend > rookie + .08, `legend bots ${legend.toFixed(3)} should outclass rookie bots ${rookie.toFixed(3)}`);
  // deterministic per seed
  const a = BotProvider.getOpponent(league, cage, 500, 42);
  const b = BotProvider.getOpponent(league, cage, 500, 42);
  assert.deepEqual(a, b);
});

test("rep ladder: wins climb with streak bonuses, losses reset the streak", () => {
  const save = freshSave();
  const winRes = mp => ({ myPlayer: { teamWon: true, gradeScore: 70, line: { id: "myplayer", pts: 10, reb: 2, ast: 2, stl: 0, blk: 0 }, objectives: [] } });
  const lossRes = () => ({ myPlayer: { teamWon: false, gradeScore: 40, line: { id: "myplayer", pts: 4, reb: 1, ast: 0, stl: 0, blk: 0 }, objectives: [] } });
  const c = courtById("cage");
  const r1 = recordParkGame(save, winRes(), "cage");
  assert.equal(r1.gain, c.repWin);            // first win, no streak bonus
  const r2 = recordParkGame(save, winRes(), "cage");
  assert.equal(r2.gain, c.repWin + 10);       // second straight
  assert.equal(save.park.streak, 2);
  const r3 = recordParkGame(save, lossRes(), "cage");
  assert.equal(r3.gain, c.repLoss);           // losses still pay a little
  assert.equal(save.park.streak, 0);
  assert.equal(save.park.bestStreak, 2);
  assert.equal(save.park.games, 3);
  assert.equal(save.park.wins, 2);
});

test("tier boundaries and progress", () => {
  assert.equal(tierOf(0).id, "ROOKIE");
  assert.equal(tierOf(399).id, "ROOKIE");
  assert.equal(tierOf(400).id, "BALLER");
  assert.equal(tierOf(99999).id, "LEGEND");
  const p = tierProgress(200);
  assert.equal(p.cur.id, "ROOKIE");
  assert.equal(p.next.id, "BALLER");
  assert.ok(p.frac > .4 && p.frac < .6);
  assert.equal(tierProgress(PARK_TIERS.at(-1).at).frac, 1);
});

test("tier-up detected when rep crosses a boundary", () => {
  const save = freshSave();
  save.park.rep = 390;
  const r = recordParkGame(save, { myPlayer: { teamWon: true, gradeScore: 60, line: { id: "myplayer", pts: 8, reb: 0, ast: 0, stl: 0, blk: 0 }, objectives: [] } }, "cage");
  assert.ok(r.tierUp, JSON.stringify(r));
  assert.equal(save.park.tier, "BALLER");
});

test("old save blobs get park fields backfilled", () => {
  const save = freshSave();
  save.park = { rep: 100, tier: "ROOKIE" };  // pre-park-mode shape
  const pk = ensurePark(save);
  assert.equal(pk.rep, 100);
  assert.equal(pk.streak, 0);
  assert.equal(pk.games, 0);
  // survives JSON roundtrip
  const round = JSON.parse(JSON.stringify(save));
  assert.equal(round.park.rep, 100);
});

test("consecutive runs are fresh matchups (seed advances with plays)", () => {
  const save = freshSave();
  const a = parkGameConfig(save, league, "cage");
  save.park.plays++;
  const b = parkGameConfig(save, league, "cage");
  assert.notEqual(a.seed, b.seed);
});
