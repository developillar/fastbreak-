import { test } from "node:test";
import assert from "node:assert/strict";
import {
  heightRange, wingspanRange, defaultBody, sanitizeBody, bodyMods,
  heightScaleOf, formatHeight, wingspanNorm, toLook, BUILDS, SKIN_TONES,
} from "../src/player/body.js";
import { createMyPlayer, toPlayerSpec, myPlayerOvr } from "../src/player/myplayer.js";
import { ARCHETYPES } from "../src/player/archetypes.js";
import { rateAttr } from "../src/core/attributes.js";
import { validateMatchConfig, makeMatchConfig } from "../src/core/contract.js";
import { buildLeague, toTeamSpec } from "../src/core/league.js";

const mk = (body, pos = "SG", arch = "slasher") =>
  createMyPlayer({ name: "Rook", position: pos, archetypeId: arch, body });

test("height ranges are position-appropriate and respect archetype caps", () => {
  const [pgMin, pgMax] = heightRange("PG", ARCHETYPES.playmaker);
  const [cMin, cMax] = heightRange("C", ARCHETYPES.rim_protector);
  assert.ok(pgMax < cMin, "PGs top out below where Cs start");
  assert.ok(pgMin >= 69 && cMax <= 85);
  // slasher height cap (1.04) trims the PF ceiling below the raw 84"
  const [, pfMax] = heightRange("PF", ARCHETYPES.slasher);
  assert.ok(pfMax < 84, "archetype cap trims range, got " + pfMax);
});

test("sanitizeBody clamps out-of-range junk", () => {
  const b = sanitizeBody({ heightIn: 99, wingspanIn: 300, build: "hulk", skin: 42 }, "PG", ARCHETYPES.playmaker);
  const [hMin, hMax] = heightRange("PG", ARCHETYPES.playmaker);
  assert.ok(b.heightIn >= hMin && b.heightIn <= hMax);
  const [wMin, wMax] = wingspanRange(b.heightIn);
  assert.ok(b.wingspanIn >= wMin && b.wingspanIn <= wMax);
  assert.equal(b.build, "balanced");
  assert.ok(b.skin >= 0 && b.skin < SKIN_TONES.length);
});

test("taller build trades speed/shooting for boards/blocks", () => {
  const [hMin, hMax] = heightRange("SF", ARCHETYPES.two_way);
  const short = mk({ ...defaultBody("SF", ARCHETYPES.two_way), heightIn: hMin }, "SF", "two_way");
  const tall = mk({ ...defaultBody("SF", ARCHETYPES.two_way), heightIn: hMax }, "SF", "two_way");
  assert.ok(tall.attrs.speed < short.attrs.speed, "tall is slower");
  assert.ok(tall.attrs.reb > short.attrs.reb, "tall rebounds better");
  assert.ok(tall.attrs.block > short.attrs.block, "tall blocks better");
  assert.ok(tall.attrs.height > short.attrs.height, "height attr follows inches");
});

test("wingspan trades shooting for defense", () => {
  const base = defaultBody("SG", ARCHETYPES.two_way);
  const tRex = mk({ ...base, wingspanIn: base.heightIn - 1 }, "SG", "two_way");
  const condor = mk({ ...base, wingspanIn: base.heightIn + 7 }, "SG", "two_way");
  assert.ok(condor.attrs.steal > tRex.attrs.steal);
  assert.ok(condor.attrs.block > tRex.attrs.block);
  assert.ok(condor.attrs.three < tRex.attrs.three);
});

test("builds shift the right attributes", () => {
  const base = defaultBody("PF", ARCHETYPES.rim_protector);
  const slim = mk({ ...base, build: "slim" }, "PF", "rim_protector");
  const strong = mk({ ...base, build: "strong" }, "PF", "rim_protector");
  assert.ok(slim.attrs.speed > strong.attrs.speed);
  assert.ok(strong.attrs.close > slim.attrs.close);
  assert.ok(strong.attrs.reb > slim.attrs.reb);
});

test("body mods never break archetype caps", () => {
  for (const archId of Object.keys(ARCHETYPES)) {
    const arch = ARCHETYPES[archId];
    for (const pos of ["PG", "SG", "SF", "PF", "C"]) {
      const [hMin, hMax] = heightRange(pos, arch);
      for (const heightIn of [hMin, hMax]) {
        const [wMin, wMax] = wingspanRange(heightIn);
        for (const build of Object.keys(BUILDS)) {
          const mp = mk({ heightIn, wingspanIn: wMax, build, skin: 2 }, pos, archId);
          for (const [k, v] of Object.entries(mp.attrs)) {
            assert.ok(v <= (arch.caps[k] ?? 0.99) + 1e-9, `${archId}/${pos} ${k} ${v} exceeds cap`);
          }
          assert.ok(myPlayerOvr(mp) > 0);
          void wMin;
        }
      }
    }
  }
});

test("look travels inside PlayerSpec and validates in a MatchConfig", () => {
  const mp = mk({ heightIn: 78, wingspanIn: 84, build: "strong", skin: 3 }, "SF", "two_way");
  const spec = toPlayerSpec(mp);
  assert.equal(spec.look.skin, 3);
  assert.equal(spec.look.build, "strong");
  assert.ok(spec.look.wingspan > 0, "long wingspan is positive-normalized");
  const league = buildLeague();
  const home = toTeamSpec(league[0]);
  home.lineup = home.lineup.slice();
  home.lineup[2] = spec;
  const cfg = makeMatchConfig({ seed: 1, home, away: toTeamSpec(league[1]), myPlayer: { side: "home", index: 2 } });
  assert.ok(validateMatchConfig(cfg));
});

test("helpers: formatting and scales", () => {
  assert.equal(formatHeight(77), "6'5\"");
  assert.ok(Math.abs(heightScaleOf(69) - 0.88) < 1e-9);
  assert.ok(Math.abs(heightScaleOf(85) - 1.14) < 1e-9);
  const b = { heightIn: 77, wingspanIn: 80 };
  assert.ok(Math.abs(wingspanNorm(b)) <= 1);
  assert.equal(typeof toLook({ ...b, build: "slim", skin: 1 }).wingspan, "number");
});

test("legacy creation without a body still works (defaults applied)", () => {
  const mp = createMyPlayer({ name: "Old Save", position: "C", archetypeId: "rim_protector" });
  assert.ok(mp.body.heightIn >= 80);
  assert.equal(mp.body.build, "balanced");
  const r = rateAttr("height", mp.attrs.height);
  assert.ok(r > 25, "height rating populated: " + r);
});
