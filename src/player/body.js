/* Physical build — the 2K-style creation tradeoffs. Height, wingspan and
   body type are chosen ONCE at creation and baked into the starting
   attributes (then clamped to archetype caps); skin tone is cosmetic.
   The look object travels inside PlayerSpec so the playable engine can
   render the body (skin color, frame width, arm length).

   Tradeoff philosophy (mirrors 2K):
     taller      -> reach/boards/rim protection, slower, softer jumper
     longer arms -> steals/blocks/boards, worse shooting touch
     slim        -> quicker, weaker inside;  strong -> the inverse           */

export const SKIN_TONES = [0xf0c8a0, 0xc98d5a, 0x8a5a32, 0x6b4225, 0xe8b48c]; // matches the game's SKINS

export const BUILDS = {
  slim: {
    id: "slim", label: "SLIM",
    blurb: "First-step burst, loses the bump battles.",
    mods: { speed: +.035, close: -.02, reb: -.025 },
    width: 0.94,
  },
  balanced: {
    id: "balanced", label: "BALANCED",
    blurb: "No lean either way.",
    mods: {},
    width: 1.0,
  },
  strong: {
    id: "strong", label: "STRONG",
    blurb: "Finishes through contact, a step slower.",
    mods: { close: +.035, reb: +.03, speed: -.035 },
    width: 1.09,
  },
};

/* height in inches -> engine height scale (0.88 .. 1.14) */
const H_MIN_IN = 69, H_MAX_IN = 85; // 5'9" .. 7'1"
export function heightScaleOf(heightIn) {
  const t = (heightIn - H_MIN_IN) / (H_MAX_IN - H_MIN_IN);
  return 0.88 + Math.max(0, Math.min(1, t)) * 0.26;
}
export function formatHeight(heightIn) {
  return Math.floor(heightIn / 12) + "'" + (heightIn % 12) + '"';
}

/* per-position creation ranges, capped by the archetype's height ceiling */
const POS_RANGES = {
  PG: [69, 77], SG: [73, 80], SF: [76, 82], PF: [78, 84], C: [80, 85],
};
export function heightRange(position, archetype) {
  let [min, max] = POS_RANGES[position] || [72, 82];
  if (archetype?.caps?.height) {
    const capIn = H_MIN_IN + ((archetype.caps.height - 0.88) / 0.26) * (H_MAX_IN - H_MIN_IN);
    max = Math.min(max, Math.floor(capIn));
  }
  return [min, Math.max(min, max)];
}

/* wingspan range relative to height: -1" .. +7", default +2" */
export function wingspanRange(heightIn) {
  return [heightIn - 1, heightIn + 7];
}
export function defaultBody(position, archetype) {
  const [hMin, hMax] = heightRange(position, archetype);
  const heightIn = Math.round((hMin + hMax) / 2);
  return { heightIn, wingspanIn: heightIn + 2, build: "balanced", skin: 0 };
}

/* -1..1 normalized wingspan (0 at the +3" midpoint) — also what the rig
   uses to stretch the arms */
export function wingspanNorm(body) {
  const [wMin, wMax] = wingspanRange(body.heightIn);
  return Math.max(-1, Math.min(1, ((body.wingspanIn - wMin) / (wMax - wMin)) * 2 - 1));
}

/* attribute deltas for a physical profile (position sets the height norm) */
export function bodyMods(body, position, archetype) {
  const mods = {};
  const add = (k, v) => { mods[k] = (mods[k] || 0) + v; };

  // height inside the position range: -0.5 (shortest) .. +0.5 (tallest)
  const [hMin, hMax] = heightRange(position, archetype);
  const dh = hMax > hMin ? (body.heightIn - hMin) / (hMax - hMin) - 0.5 : 0;
  add("speed", -dh * .12);
  add("three", -dh * .05);
  add("reb", dh * .07);
  add("block", dh * .07);

  // wingspan: defense/boards vs shooting touch
  const dw = wingspanNorm(body);
  add("steal", dw * .05);
  add("block", dw * .05);
  add("reb", dw * .04);
  add("three", -dw * .045);
  add("mid", -dw * .035);

  // build
  const b = BUILDS[body.build] || BUILDS.balanced;
  for (const [k, v] of Object.entries(b.mods)) add(k, v);

  return mods;
}

export function sanitizeBody(body, position, archetype) {
  const d = defaultBody(position, archetype);
  const out = { ...d, ...(body || {}) };
  const [hMin, hMax] = heightRange(position, archetype);
  out.heightIn = Math.round(Math.max(hMin, Math.min(hMax, out.heightIn)));
  const [wMin, wMax] = wingspanRange(out.heightIn);
  out.wingspanIn = Math.round(Math.max(wMin, Math.min(wMax, out.wingspanIn)));
  if (!BUILDS[out.build]) out.build = "balanced";
  out.skin = Math.max(0, Math.min(SKIN_TONES.length - 1, out.skin | 0));
  return out;
}

/* the renderable appearance that rides inside PlayerSpec */
export function toLook(body) {
  return {
    skin: body.skin,
    build: body.build,
    wingspan: Math.round(wingspanNorm(body) * 100) / 100,
  };
}
