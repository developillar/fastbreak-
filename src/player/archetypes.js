/* Archetypes set attribute CAPS and badge ACCESS — they are the identity
   choice at creation. Starting attributes are position baseline scaled down;
   the cap table is where builds differentiate. Caps/access feed myplayer.js
   (spendUP / unlockBadge) and never the engines directly — engines only see
   the resulting PlayerSpec. */

import { ATTR_KEYS } from "../core/attributes.js";

/* tiers: 0 locked/none, 1 Bronze, 2 Silver, 3 Gold, 4 Hall of Fame */
export const TIER_NAMES = ["—", "BRONZE", "SILVER", "GOLD", "HOF"];

export const ARCHETYPES = {
  slasher: {
    id: "slasher", label: "SLASHER",
    blurb: "Downhill every possession. Elite finishing and burst, streaky from deep.",
    caps: { speed: .97, three: .70, mid: .78, close: .95, dunk: .97, steal: .75, block: .55, reb: .65, pas: .75, height: 1.04 },
    badgeAccess: { posterizer: 4, acrobat_finisher: 4, ankle_assassin: 3, first_step: 4, deadeye: 1, dimer: 2, pickpocket: 2, glass_cleaner: 2, rim_guardian: 1, clamps: 2 },
  },
  sharpshooter: {
    id: "sharpshooter", label: "SHARPSHOOTER",
    blurb: "Gravity from the parking lot. Lights out off the catch, limited inside.",
    caps: { speed: .88, three: .97, mid: .95, close: .70, dunk: .55, steal: .70, block: .45, reb: .55, pas: .80, height: 1.02 },
    badgeAccess: { deadeye: 4, limitless: 4, green_machine: 4, ankle_assassin: 2, dimer: 2, first_step: 2, posterizer: 1, acrobat_finisher: 1, pickpocket: 2, clamps: 2 },
  },
  playmaker: {
    id: "playmaker", label: "PLAYMAKER",
    blurb: "The offense runs through you. Vision, handles, ankle insurance sold separately.",
    caps: { speed: .95, three: .82, mid: .85, close: .78, dunk: .60, steal: .85, block: .40, reb: .55, pas: .97, height: 1.00 },
    badgeAccess: { dimer: 4, ankle_assassin: 4, first_step: 3, deadeye: 2, green_machine: 2, pickpocket: 3, limitless: 2, acrobat_finisher: 2, clamps: 2, glass_cleaner: 1 },
  },
  lockdown: {
    id: "lockdown", label: "LOCKDOWN",
    blurb: "Ninety-four feet of bad news. Steals, deflections, and silence on the other end.",
    caps: { speed: .93, three: .75, mid: .78, close: .75, dunk: .70, steal: .97, block: .70, reb: .70, pas: .75, height: 1.04 },
    badgeAccess: { clamps: 4, pickpocket: 4, first_step: 2, ankle_assassin: 2, deadeye: 2, rim_guardian: 2, glass_cleaner: 2, posterizer: 2, dimer: 1, limitless: 1 },
  },
  rim_protector: {
    id: "rim_protector", label: "RIM PROTECTOR",
    blurb: "The paint is a members-only club. Blocks, boards, drop-step finishes.",
    caps: { speed: .78, three: .50, mid: .68, close: .95, dunk: .93, steal: .60, block: .97, reb: .97, pas: .60, height: 1.12 },
    badgeAccess: { rim_guardian: 4, glass_cleaner: 4, posterizer: 3, acrobat_finisher: 2, clamps: 2, pickpocket: 1, deadeye: 1, dimer: 1, first_step: 1, limitless: 0 },
  },
  two_way: {
    id: "two_way", label: "TWO-WAY",
    blurb: "No weaknesses, no god-mode. Every badge open to Silver-plus, every attr solid.",
    caps: { speed: .90, three: .85, mid: .85, close: .85, dunk: .82, steal: .85, block: .78, reb: .80, pas: .85, height: 1.06 },
    badgeAccess: { deadeye: 3, limitless: 2, green_machine: 2, ankle_assassin: 3, first_step: 3, dimer: 3, posterizer: 3, acrobat_finisher: 3, clamps: 3, pickpocket: 3, rim_guardian: 3, glass_cleaner: 3 },
  },
};

export const POSITIONS = ["PG", "SG", "SF", "PF", "C"];

/* starting attrs: 72% of the archetype cap, floored — you grow into the build */
export function startingAttrs(archetype, position) {
  const posHeights = { PG: 0.94, SG: 0.98, SF: 1.0, PF: 1.04, C: 1.08 };
  const out = {};
  for (const k of ATTR_KEYS) {
    if (k === "height") {
      out[k] = Math.min(archetype.caps.height, posHeights[position] ?? 1.0);
    } else {
      out[k] = Math.max(0.25, archetype.caps[k] * 0.72);
    }
  }
  return out;
}
