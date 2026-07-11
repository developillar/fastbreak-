import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createMyPlayer, spendUP, canUpgrade, unlockBadge, canUnlockBadge,
  toPlayerSpec, applyMatchRewards, rewardsFor, myPlayerOvr, capsOf,
} from "../src/player/myplayer.js";
import { ARCHETYPES } from "../src/player/archetypes.js";
import { BADGE_TIER_COST } from "../src/player/badges.js";
import { rateAttr } from "../src/core/attributes.js";

test("creation: every archetype x position builds a legal player", () => {
  for (const archetypeId of Object.keys(ARCHETYPES)) {
    for (const position of ["PG", "SG", "SF", "PF", "C"]) {
      const mp = createMyPlayer({ name: "Test Player", position, archetypeId });
      assert.equal(mp.id, "myplayer");
      const caps = capsOf(mp);
      for (const [k, v] of Object.entries(mp.attrs)) {
        assert.ok(v <= caps[k] + 1e-9, `${archetypeId}/${position} ${k} starts under cap`);
      }
      assert.ok(myPlayerOvr(mp) >= 40 && myPlayerOvr(mp) <= 85);
    }
  }
});

test("creation sanitizes names and rejects garbage", () => {
  const mp = createMyPlayer({ name: '  j<b>"Rook&\' Dupree  ', position: "PG", archetypeId: "playmaker" });
  assert.ok(!/[<>&"]/.test(mp.name));
  assert.ok(mp.name.length <= 14);
  assert.throws(() => createMyPlayer({ name: "X", position: "PG", archetypeId: "nope" }), /archetype/);
  assert.throws(() => createMyPlayer({ name: "", position: "PG", archetypeId: "slasher" }), /Name/);
});

test("spendUP raises the rating by 1 and respects UP balance + caps", () => {
  const mp = createMyPlayer({ name: "Rook", position: "SG", archetypeId: "sharpshooter" });
  const before = rateAttr("three", mp.attrs.three);
  const upBefore = mp.up;
  const { cost } = canUpgrade(mp, "three");
  spendUP(mp, "three");
  assert.equal(rateAttr("three", mp.attrs.three), before + 1);
  assert.equal(mp.up, upBefore - cost);

  // drain UP -> refused
  mp.up = 0;
  assert.throws(() => spendUP(mp, "three"), /UP/);

  // pump to cap -> refused with cap reason
  mp.up = 100000;
  let guard = 0;
  while (canUpgrade(mp, "three").ok && guard++ < 200) spendUP(mp, "three");
  const cap = rateAttr("three", capsOf(mp).three);
  assert.equal(rateAttr("three", mp.attrs.three), cap);
  assert.match(canUpgrade(mp, "three").reason, /cap/);
});

test("height is not purchasable", () => {
  const mp = createMyPlayer({ name: "Rook", position: "C", archetypeId: "rim_protector" });
  assert.equal(canUpgrade(mp, "height").ok, false);
});

test("badges: archetype access gates tiers, rep is spent", () => {
  const mp = createMyPlayer({ name: "Rook", position: "PF", archetypeId: "rim_protector" });
  mp.rep = 10000;
  // rim_protector can take rim_guardian to HoF
  for (let t = 1; t <= 4; t++) unlockBadge(mp, "rim_guardian");
  assert.equal(mp.badges.rim_guardian, 4);
  assert.match(canUnlockBadge(mp, "rim_guardian").reason, /max tier/);
  // limitless is locked out entirely for rim_protector
  assert.equal(canUnlockBadge(mp, "limitless").ok, false);
  // rep accounting
  const spent = BADGE_TIER_COST[1] + BADGE_TIER_COST[2] + BADGE_TIER_COST[3] + BADGE_TIER_COST[4];
  assert.equal(mp.rep, 10000 - spent);
  // broke -> refused
  mp.rep = 0;
  assert.equal(canUnlockBadge(mp, "glass_cleaner").ok, false);
});

test("toPlayerSpec produces a contract-shaped player", () => {
  const mp = createMyPlayer({ name: "Rook", position: "SF", archetypeId: "two_way" });
  mp.badges = { deadeye: 2 };
  const spec = toPlayerSpec(mp);
  assert.equal(spec.id, "myplayer");
  assert.equal(spec.role, "SF");
  assert.deepEqual(spec.badges, [{ id: "deadeye", tier: 2 }]);
  assert.ok(Object.keys(spec.attrs).length === 10);
});

test("match rewards flow into UP/Rep and career totals", () => {
  const mp = createMyPlayer({ name: "Rook", position: "PG", archetypeId: "playmaker" });
  const up0 = mp.up;
  const fakeResult = {
    myPlayer: {
      line: { id: "myplayer", pts: 22, reb: 4, ast: 9, stl: 2, blk: 0 },
      grade: "A-", gradeScore: 80, teamWon: true,
      objectives: [{ id: "o", met: true }],
    },
  };
  const earned = applyMatchRewards(mp, fakeResult);
  assert.ok(earned.up > 0 && earned.rep > 0);
  assert.equal(mp.up, up0 + earned.up);
  assert.equal(mp.totals.games, 1);
  assert.equal(mp.totals.wins, 1);
  assert.equal(mp.totals.pts, 22);
  // a result for someone else's line rewards nothing
  const other = applyMatchRewards(mp, { myPlayer: { line: { id: "cpu-1" }, gradeScore: 90 } });
  assert.deepEqual(other, { up: 0, rep: 0 });
});

test("better grades reward more", () => {
  const low = rewardsFor({ gradeScore: 30, teamWon: false, objectives: [] });
  const high = rewardsFor({ gradeScore: 95, teamWon: true, objectives: [] });
  assert.ok(high.up > low.up);
  assert.ok(high.rep > low.rep);
});
