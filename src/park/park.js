/* =============================================================================
   THE PARK (P3) — court-select hub, rep ladder, and the OpponentProvider seam.

   Design decisions from the spec:
   - Menu-map hub (not walkable): pick a court, play, climb the ladder.
   - OpponentProvider interface: BotProvider now; a NetProvider drops into
     the same seam later without touching anything else.
   - 1v1/2v2/3v3 run through the headless engine (half court, first-to-N,
     ones-and-twos); FULL RUNS is the playable 5v5 court. Playable
     half-court is the remaining P3 engine work.
   ========================================================================== */

import { makeMatchConfig } from "../core/contract.js";
import { toTeamSpec } from "../core/league.js";
import { toPlayerSpec, applyMatchRewards } from "../player/myplayer.js";
import { POSITIONS } from "../player/archetypes.js";
import { ROLES } from "../core/attributes.js";
import { Rng, hashSeed } from "../core/rng.js";

/* ---------------- rep ladder ---------------- */
export const PARK_TIERS = [
  { id: "ROOKIE",  label: "PARK ROOKIE", at: 0 },
  { id: "BALLER",  label: "BALLER",      at: 400 },
  { id: "ELITE",   label: "PARK ELITE",  at: 1200 },
  { id: "ALLPARK", label: "ALL-PARK",    at: 3000 },
  { id: "LEGEND",  label: "PARK LEGEND", at: 6500 },
];
export function tierOf(rep) {
  let t = PARK_TIERS[0];
  for (const x of PARK_TIERS) if (rep >= x.at) t = x;
  return t;
}
export function tierProgress(rep) {
  const cur = tierOf(rep);
  const idx = PARK_TIERS.indexOf(cur);
  const next = PARK_TIERS[idx + 1] || null;
  const frac = next ? (rep - cur.at) / (next.at - cur.at) : 1;
  return { cur, next, frac: Math.max(0, Math.min(1, frac)) };
}

/* ---------------- courts ---------------- */
export const COURTS = [
  {
    id: "cage", label: "THE CAGE", mode: "1v1", sides: 1, court: "half",
    blurb: "You against him. First to 11 by 1s and 2s, win by 2.",
    rules: { mode: "target", targetScore: 11, winBy: 2, scoring: "ones-and-twos" },
    repWin: 35, repLoss: 8,
  },
  {
    id: "duo", label: "THE BACKYARD", mode: "2v2", sides: 2, court: "half",
    blurb: "Grab a partner. First to 15, win by 2.",
    rules: { mode: "target", targetScore: 15, winBy: 2, scoring: "ones-and-twos" },
    repWin: 45, repLoss: 10,
  },
  {
    id: "stage", label: "MAIN STAGE", mode: "3v3", sides: 3, court: "half",
    blurb: "Where reps are made. First to 21, win by 2.",
    rules: { mode: "target", targetScore: 21, winBy: 2, scoring: "ones-and-twos" },
    repWin: 60, repLoss: 12,
  },
  {
    id: "runs", label: "FULL RUNS", mode: "5v5", sides: 5, court: "full",
    blurb: "Full-court fives under the lights. Two quarters.",
    rules: { mode: "timed", quarters: 2, quarterLength: 120 },
    repWin: 80, repLoss: 15,
    playable: true,
  },
];
export const courtById = id => COURTS.find(c => c.id === id);

const BOT_SQUADS = ["RIM REAPERS", "ASPHALT KINGS", "NO EASY BUCKETS", "GRAVE DIGGERS",
  "CHAIN NET MAFIA", "DOUBLE RIM VETS", "SUNSET RUNNERS", "BLOCK PARTY"];
const MATE_SQUAD = { name: "MY SQUAD", abbr: "SQD", colors: { primary: 0x2f7bff, secondary: 0x122a5c, ui: "#7fb0ff" } };

/* ---------------- OpponentProvider seam ----------------
   getOpponent(league, court, rep, seed) -> TeamSpec
   BotProvider scales squads to your park rep; a future NetProvider returns
   real players' squads through the exact same call. */
export const BotProvider = {
  id: "bot",
  getOpponent(league, court, rep, seed) {
    const rng = new Rng(seed);
    const t = Math.max(0, Math.min(1, rep / PARK_TIERS[PARK_TIERS.length - 1].at));
    const boost = -0.06 + t * 0.15;      // rookies see soft runs, legends see killers
    const lineup = [];
    const used = new Set();
    for (let i = 0; i < court.sides; i++) {
      let src = null, guard = 0;
      while (guard++ < 40) {
        const team = rng.pick(league);
        const cand = team.lineup[court.sides === 1 ? rng.int(0, 3) : i];
        if (!used.has(cand.id)) { used.add(cand.id); src = cand; break; }
      }
      src = src || league[0].lineup[i];
      const attrs = {};
      for (const k in src.attrs) {
        attrs[k] = k === "height" ? src.attrs[k]
          : Math.max(.2, Math.min(.99, src.attrs[k] + boost + rng.range(-.02, .02)));
      }
      lineup.push({ ...src, id: "park-bot-" + i, attrs, role: ROLES[i] || src.role });
    }
    return {
      id: "park-bots",
      name: BOT_SQUADS[rng.int(0, BOT_SQUADS.length)],
      abbr: "PRK",
      colors: { primary: 0x3a4150, secondary: 0x15181f, ui: "#aeb9c9" },
      lineup,
    };
  },
};

/* your squad: MyPlayer + street mates pulled from around the league */
export function mySquad(save, league, court, seed) {
  const rng = new Rng(seed);
  const spec = toPlayerSpec(save.myPlayer);
  const lineup = [spec];
  const used = new Set([spec.id]);
  for (let i = 1; i < court.sides; i++) {
    let src = null, guard = 0;
    while (guard++ < 40) {
      const team = rng.pick(league);
      const cand = team.lineup[i];
      if (!used.has(cand.id)) { used.add(cand.id); src = cand; break; }
    }
    src = src || league[1].lineup[i];
    lineup.push({ ...src, id: "park-mate-" + i, role: ROLES[i] || src.role });
  }
  // 5v5 full runs need a full positional lineup with MyPlayer in his slot
  if (court.sides === 5) {
    const slot = Math.max(0, POSITIONS.indexOf(save.myPlayer.position));
    const base = toTeamSpec(league[rng.int(0, league.length)]);
    const full = base.lineup.map((p, i) => ({ ...p, id: "park-mate-" + i }));
    full[slot] = spec;
    return { team: { ...MATE_SQUAD, id: "park-squad", lineup: full }, slot };
  }
  return { team: { ...MATE_SQUAD, id: "park-squad", lineup }, slot: 0 };
}

export function ensurePark(save) {
  const p = save.park || {};
  save.park = {
    rep: p.rep || 0,
    tier: p.tier || "ROOKIE",
    streak: p.streak || 0,
    bestStreak: p.bestStreak || 0,
    games: p.games || 0,
    wins: p.wins || 0,
    plays: p.plays || 0,     // seed counter so every run is a fresh matchup
    pending: p.pending || null,
  };
  return save.park;
}

export function parkGameConfig(save, league, courtId, provider = BotProvider) {
  const court = courtById(courtId);
  if (!court) throw new Error("Unknown court: " + courtId);
  const park = ensurePark(save);
  const seed = hashSeed("park:" + courtId + ":" + park.rep + ":" + park.plays);
  const { team: home, slot } = mySquad(save, league, court, seed + 1);
  const away = provider.getOpponent(league, court, park.rep, seed + 2);
  const tierIdx = PARK_TIERS.indexOf(tierOf(park.rep));
  return makeMatchConfig({
    seed,
    court: court.court,
    sides: court.sides,
    difficulty: Math.min(2, Math.max(0, tierIdx - 1)),
    rules: court.rules,
    home, away,
    myPlayer: { side: "home", index: slot },
    meta: { label: court.label + " · " + court.mode + " vs " + away.name, park: courtId, venue: "park" },
  });
}

export function recordParkGame(save, result, courtId, { played = false } = {}) {
  const court = courtById(courtId);
  const park = ensurePark(save);
  const won = !!result.myPlayer?.teamWon;
  park.plays++;
  park.games++;
  if (won) {
    park.wins++;
    park.streak++;
    park.bestStreak = Math.max(park.bestStreak, park.streak);
  } else {
    park.streak = 0;
  }
  const streakBonus = won ? Math.min(5, park.streak - 1) * 10 : 0;
  const gain = won ? court.repWin + streakBonus : court.repLoss;
  park.rep += gain;
  const before = park.tier;
  park.tier = tierOf(park.rep).id;
  const earned = applyMatchRewards(save.myPlayer, result, played ? 0.9 : 0.5);
  return { won, gain, streak: park.streak, tier: park.tier, tierUp: park.tier !== before, earned };
}
