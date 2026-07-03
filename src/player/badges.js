/* Badges inject multipliers at exact sim resolution points ("hooks").
   Both engines call badgeMultiplier() at the SAME hooks so a Gold Deadeye
   means the same thing in a played game and a simmed one.

   Hook catalog (ctx fields each hook receives):
     shot.pct        {shotType, contested, deep}   final make-probability multiplier
     shot.window     {shotType, contested}         green-window size (playable meter)
     finish.pct      {dunk, traffic}               dunk/layup make multiplier
     move.break      {}                            chance a cross/spin freezes the defender
     pass.assist     {}                            receiver's shot bonus off your pass
     steal.chance    {onBall}                      steal attempt success multiplier
     block.chance    {}                            block attempt success multiplier
     reb.range       {}                            rebound reach/weight multiplier
     def.window      {}                            shrink opponent green window (on-ball)
*/

export const BADGES = {
  deadeye: {
    id: "deadeye", label: "DEADEYE", cat: "shooting",
    blurb: "Contested jumpers bother you less.",
    hooks: { "shot.pct": (t, ctx) => (ctx.contested && ctx.shotType !== "DUNK" && ctx.shotType !== "LAYUP") ? 1 + .06 * t : 1,
             "shot.window": (t, ctx) => ctx.contested ? 1 + .10 * t : 1 },
  },
  limitless: {
    id: "limitless", label: "LIMITLESS RANGE", cat: "shooting",
    blurb: "Deep threes stop being hero shots.",
    hooks: { "shot.pct": (t, ctx) => (ctx.shotType === "THREE" && ctx.deep) ? 1 + .09 * t : 1 },
  },
  green_machine: {
    id: "green_machine", label: "GREEN MACHINE", cat: "shooting",
    blurb: "Bigger green window on every jumper.",
    hooks: { "shot.window": (t) => 1 + .07 * t,
             "shot.pct": (t, ctx) => (ctx.shotType === "THREE" || ctx.shotType === "MID") ? 1 + .03 * t : 1 },
  },
  posterizer: {
    id: "posterizer", label: "POSTERIZER", cat: "finishing",
    blurb: "Dunk attempts in traffic land violently more often.",
    hooks: { "finish.pct": (t, ctx) => ctx.dunk ? 1 + .07 * t : 1 },
  },
  acrobat_finisher: {
    id: "acrobat_finisher", label: "ACROBAT", cat: "finishing",
    blurb: "Wild layups kiss in.",
    hooks: { "finish.pct": (t, ctx) => !ctx.dunk ? 1 + .06 * t : 1 },
  },
  first_step: {
    id: "first_step", label: "FIRST STEP", cat: "playmaking",
    blurb: "Blow-bys off the bounce.",
    hooks: { "move.break": (t) => 1 + .08 * t, "shot.pct": (t, ctx) => ctx.shotType === "LAYUP" ? 1 + .02 * t : 1 },
  },
  ankle_assassin: {
    id: "ankle_assassin", label: "ANKLE ASSASSIN", cat: "playmaking",
    blurb: "Crossovers snatch souls.",
    hooks: { "move.break": (t) => 1 + .12 * t },
  },
  dimer: {
    id: "dimer", label: "DIMER", cat: "playmaking",
    blurb: "Your passes arrive on time, on target, on fire.",
    hooks: { "pass.assist": (t) => 1 + .06 * t },
  },
  clamps: {
    id: "clamps", label: "CLAMPS", cat: "defense",
    blurb: "On-ball defense that shrinks shooting windows.",
    hooks: { "def.window": (t) => 1 - .08 * t, "steal.chance": (t, ctx) => ctx.onBall ? 1 + .05 * t : 1 },
  },
  pickpocket: {
    id: "pickpocket", label: "PICKPOCKET", cat: "defense",
    blurb: "Live-dribble strips and lane picks.",
    hooks: { "steal.chance": (t) => 1 + .09 * t },
  },
  rim_guardian: {
    id: "rim_guardian", label: "RIM GUARDIAN", cat: "defense",
    blurb: "Meet them at the summit.",
    hooks: { "block.chance": (t) => 1 + .10 * t },
  },
  glass_cleaner: {
    id: "glass_cleaner", label: "GLASS CLEANER", cat: "rebounding",
    blurb: "Every carom is yours by right.",
    hooks: { "reb.range": (t) => 1 + .08 * t },
  },
};

/* badges: [{id, tier}] (a PlayerSpec's list) -> multiplier for one hook */
export function badgeMultiplier(badges, hook, ctx = {}) {
  if (!badges || badges.length === 0) return 1;
  let m = 1;
  for (const b of badges) {
    const def = BADGES[b.id];
    const fn = def?.hooks?.[hook];
    if (fn && b.tier > 0) m *= fn(b.tier, ctx);
  }
  return m;
}

/* Rep price to move a badge from (tier-1) -> tier */
export const BADGE_TIER_COST = [0, 300, 700, 1400, 2600];
