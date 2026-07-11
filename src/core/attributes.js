/* The 10-attribute system shared by the playable engine, the headless engine,
   league generation and MyPlayer. Attributes are stored as 0..1 floats
   internally; rate()/unrate() convert to the 25..99 scale shown to players. */

export const ATTR_KEYS = ["speed", "three", "mid", "close", "dunk", "steal", "block", "reb", "pas", "height"];

export const ATTR_LABELS = {
  speed: "SPD", three: "3PT", mid: "MID", close: "INS", dunk: "DNK",
  steal: "STL", block: "BLK", reb: "REB", pas: "PAS", height: "HGT",
};

export const ROLES = ["PG", "SG", "SF", "PF", "C"];

/* 0..1 → displayed 25..99 rating (height uses its own band, see rateAttr) */
export function rate(v) {
  return Math.round(25 + 74 * Math.max(0, Math.min(1, v)));
}
export function unrate(r) {
  return Math.max(0, Math.min(1, (r - 25) / 74));
}
/* height lives in 0.88..1.14 world-scale space in the engine */
export function rateAttr(key, v) {
  if (key === "height") return Math.round(25 + 74 * Math.max(0, Math.min(1, (v - 0.88) / 0.26)));
  return rate(v);
}
export function unrateAttr(key, r) {
  if (key === "height") return 0.88 + Math.max(0, Math.min(1, (r - 25) / 74)) * 0.26;
  return unrate(r);
}

export function ovrOf(attrs) {
  const a = attrs;
  return rate((a.speed + a.three + a.mid + a.close + a.dunk + a.steal + a.block + a.reb + a.pas) / 9);
}

export function clampAttrs(attrs) {
  const out = {};
  for (const k of ATTR_KEYS) {
    const v = attrs[k] ?? 0.5;
    out[k] = k === "height" ? Math.max(0.88, Math.min(1.14, v)) : Math.max(0.1, Math.min(0.99, v));
  }
  return out;
}

/* Positional baselines — same table the 5v5 game ships with. */
export const ROLE_BASE_ATTRS = [
  { speed: .97, three: .84, mid: .80, close: .70, dunk: .40, steal: .86, block: .30, reb: .38, pas: .93, height: .94 }, // PG
  { speed: .92, three: .88, mid: .85, close: .76, dunk: .62, steal: .72, block: .42, reb: .46, pas: .72, height: .98 }, // SG
  { speed: .87, three: .78, mid: .80, close: .80, dunk: .80, steal: .66, block: .60, reb: .63, pas: .66, height: 1.00 }, // SF
  { speed: .80, three: .55, mid: .70, close: .86, dunk: .85, steal: .52, block: .76, reb: .83, pas: .52, height: 1.04 }, // PF
  { speed: .74, three: .32, mid: .60, close: .90, dunk: .92, steal: .46, block: .90, reb: .93, pas: .45, height: 1.08 }, // C
];
