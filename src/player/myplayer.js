/* The one persistent MyPlayer entity. MyCareer and Park both consume this;
   engines only ever see toPlayerSpec(mp). Two-currency economy:
     UP  (Upgrade Points) -> attributes, capped by archetype
     Rep                  -> badges + cosmetics (never attributes)
*/

import { ATTR_KEYS, rateAttr, unrateAttr, ovrOf, clampAttrs } from "../core/attributes.js";
import { makePlayerSpec, GRADE_ORDER } from "../core/contract.js";
import { ARCHETYPES, POSITIONS, startingAttrs } from "./archetypes.js";
import { BADGES, BADGE_TIER_COST } from "./badges.js";

export const MYPLAYER_SCHEMA = 1;
export const MYPLAYER_ID = "myplayer";

export function createMyPlayer({ name, position, archetypeId, look = {} }) {
  const archetype = ARCHETYPES[archetypeId];
  if (!archetype) throw new Error("Unknown archetype: " + archetypeId);
  if (!POSITIONS.includes(position)) throw new Error("Unknown position: " + position);
  const cleanName = String(name || "").trim().toUpperCase().replace(/[<>&"]/g, "").slice(0, 14);
  if (!cleanName) throw new Error("Name required");
  return {
    schema: MYPLAYER_SCHEMA,
    id: MYPLAYER_ID,
    name: cleanName,
    position,
    archetypeId,
    look: { skin: look.skin ?? 0, jerseyNum: look.jerseyNum ?? 0 },
    attrs: clampAttrs(startingAttrs(archetype, position)),
    badges: {},                 // {badgeId: tier}
    up: 12,                     // starter allowance: shape your build immediately
    rep: 0,
    parkRep: 0,
    totals: { games: 0, wins: 0, pts: 0, reb: 0, ast: 0, stl: 0, blk: 0 },
    createdAt: null,            // stamped by the app layer (engines must stay clock-free)
  };
}

export function capsOf(mp) { return ARCHETYPES[mp.archetypeId].caps; }
export function badgeAccessOf(mp) { return ARCHETYPES[mp.archetypeId].badgeAccess; }
export function myPlayerOvr(mp) { return ovrOf(mp.attrs); }

/* ---- attributes (UP) ------------------------------------------------- */
/* cost to raise an attribute by ONE displayed rating point, scaling with
   how high it already is — early growth is cheap, elite points are earned */
export function upgradeCost(mp, key) {
  const r = rateAttr(key, mp.attrs[key]);
  if (r >= 95) return 8;
  if (r >= 90) return 6;
  if (r >= 85) return 5;
  if (r >= 80) return 4;
  if (r >= 70) return 3;
  if (r >= 60) return 2;
  return 1;
}

export function canUpgrade(mp, key) {
  if (!ATTR_KEYS.includes(key) || key === "height") return { ok: false, reason: "locked" };
  const cap = capsOf(mp)[key];
  const capR = rateAttr(key, cap);
  const curR = rateAttr(key, mp.attrs[key]);
  if (curR >= capR) return { ok: false, reason: "at archetype cap (" + capR + ")" };
  const cost = upgradeCost(mp, key);
  if (mp.up < cost) return { ok: false, reason: "need " + cost + " UP" };
  return { ok: true, cost, next: curR + 1 };
}

export function spendUP(mp, key) {
  const c = canUpgrade(mp, key);
  if (!c.ok) throw new Error("Cannot upgrade " + key + ": " + c.reason);
  mp.up -= c.cost;
  mp.attrs[key] = unrateAttr(key, c.next);
  return mp;
}

/* ---- badges (Rep) ----------------------------------------------------- */
export function canUnlockBadge(mp, badgeId) {
  if (!BADGES[badgeId]) return { ok: false, reason: "unknown badge" };
  const maxTier = badgeAccessOf(mp)[badgeId] ?? 0;
  const cur = mp.badges[badgeId] ?? 0;
  if (cur >= maxTier) return { ok: false, reason: cur === 0 ? "not available to this archetype" : "at archetype max tier" };
  const cost = BADGE_TIER_COST[cur + 1];
  if (mp.rep < cost) return { ok: false, reason: "need " + cost + " Rep" };
  return { ok: true, cost, next: cur + 1 };
}

export function unlockBadge(mp, badgeId) {
  const c = canUnlockBadge(mp, badgeId);
  if (!c.ok) throw new Error("Cannot unlock " + badgeId + ": " + c.reason);
  mp.rep -= c.cost;
  mp.badges[badgeId] = c.next;
  return mp;
}

/* ---- engine handoff --------------------------------------------------- */
export function toPlayerSpec(mp) {
  return makePlayerSpec({
    id: mp.id,
    name: mp.name,
    role: mp.position,
    attrs: mp.attrs,
    badges: Object.entries(mp.badges).map(([id, tier]) => ({ id, tier })),
  });
}

/* ---- rewards ----------------------------------------------------------
   grade -> currency. Non-predatory by design: currencies flow ONLY from
   play. gradeScore 0..100, plus win bonus, plus objective bonuses. */
export function rewardsFor(myPlayerResult) {
  if (!myPlayerResult) return { up: 0, rep: 0 };
  const g = myPlayerResult.gradeScore ?? 50;
  const won = !!myPlayerResult.teamWon;
  const objBonus = (myPlayerResult.objectives || []).filter(o => o.met).length;
  const up = Math.max(1, Math.round(g / 18) + (won ? 1 : 0) + objBonus);
  const rep = Math.max(25, Math.round(g * 2.2) + (won ? 60 : 0) + objBonus * 45);
  return { up, rep };
}

export function applyMatchRewards(mp, result) {
  const r = result?.myPlayer;
  if (!r || r.line?.id !== mp.id) return { up: 0, rep: 0 };
  const { up, rep } = rewardsFor(r);
  mp.up += up;
  mp.rep += rep;
  mp.totals.games += 1;
  if (r.teamWon) mp.totals.wins += 1;
  mp.totals.pts += r.line.pts;
  mp.totals.reb += r.line.reb;
  mp.totals.ast += r.line.ast;
  mp.totals.stl += r.line.stl;
  mp.totals.blk += r.line.blk;
  return { up, rep };
}

export { GRADE_ORDER };
