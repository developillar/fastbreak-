/* The 12-team fictional league, extracted from the 5v5 game so MyCareer,
   Park matchmaking and the headless engine can all generate the same world.
   buildLeague(seed) is deterministic; the game and the app hub share seed
   20260703 so rosters line up everywhere. */

import { mulberry32 } from "./rng.js";
import { ROLES, ROLE_BASE_ATTRS, ovrOf, clampAttrs } from "./attributes.js";
import { makePlayerSpec } from "./contract.js";

export const LEAGUE_SEED = 20260703;

export const TEAM_DEFS = [
  { city: "BAY CITY", name: "FOG", abbr: "FOG", col: 0x2f8f8a, col2: 0x123c39, ui: "#53d6cd", tier: .02, style: { three: .05, mid: .03, pas: .03 } },
  { city: "ANGELVILLE", name: "QUAKES", abbr: "QKS", col: 0xc9342b, col2: 0x4a100c, ui: "#ff7a6e", tier: .04, style: { dunk: .06, speed: .04 } },
  { city: "EMERALD COAST", name: "KRAKENS", abbr: "KRK", col: 0x1f9d55, col2: 0x0b3d22, ui: "#5fe39a", tier: 0, style: { block: .06, reb: .05 } },
  { city: "DESERT VALE", name: "SCORPIONS", abbr: "SCO", col: 0xd97a1e, col2: 0x4d2a08, ui: "#ffb066", tier: -.01, style: { steal: .06, speed: .03 } },
  { city: "IRON FALLS", name: "FORGE", abbr: "IRN", col: 0x4a6584, col2: 0x1a2534, ui: "#8fb4dd", tier: .01, style: { close: .05, reb: .04 } },
  { city: "NORTH SHORE", name: "WOLFPACK", abbr: "WLF", col: 0x5b6472, col2: 0x22262d, ui: "#aeb9c9", tier: 0, style: { mid: .05, steal: .03 } },
  { city: "CRESCENT CITY", name: "GHOSTS", abbr: "GHO", col: 0x7a4fd1, col2: 0x2a1a4d, ui: "#b79aff", tier: .03, style: { three: .07 } },
  { city: "SUN HARBOR", name: "RAYS", abbr: "RAY", col: 0xe0b81f, col2: 0x4d3f08, ui: "#ffe066", tier: -.02, style: { speed: .06, pas: .04 } },
  { city: "BIG SKY", name: "BISON", abbr: "BSN", col: 0x8a4b2f, col2: 0x33190e, ui: "#e09b76", tier: -.01, style: { reb: .07, close: .04 } },
  { city: "TWIN PEAKS", name: "YETIS", abbr: "YTI", col: 0xd8e4f0, col2: 0x3f5468, ui: "#e8f1fb", tier: .01, style: { block: .07, height: .02 } },
  { city: "GULF CITY", name: "HERONS", abbr: "HRN", col: 0x2e7fc2, col2: 0x0e2f4d, ui: "#7fc0f2", tier: 0, style: { pas: .06, three: .03 } },
  { city: "CAPITAL", name: "SENTINELS", abbr: "SEN", col: 0x30395c, col2: 0x121627, ui: "#93a0e8", tier: .05, style: { mid: .04, block: .04, steal: .03 } },
];

export const SURNAMES = ["VOSS", "OKAFOR", "TREMBLE", "KIRR", "HOLLIS", "CANTU", "WALLACE", "NDIAYE", "BRIGHT", "KOLAR",
  "DRAKOS", "IBSEN", "MERCER", "QUON", "TALLEY", "FINCH", "ROSARIO", "BEKELE", "HALVORSEN", "DUPREE",
  "KANE", "SOSA", "IWATA", "PRICE", "LUND", "ADEYEMI", "CROSS", "VARGA", "THIBODEAU", "RENNER",
  "BLACKWOOD", "OYELARAN", "MARSH", "KOVAC", "DELGADO", "PETROV", "ASANTE", "WHITLOCK", "JUEL", "RAMBERT",
  "ONYEKA", "STROUD", "LACROIX", "HARGROVE", "MENSAH", "VOLKOV", "ARCHULETA", "PIKE", "SUMMERS", "GRADY",
  "NAKAMURA", "FONTAINE", "BOYD", "ELLISON", "TANAKA", "MBEKI", "CARR", "LINDGREN", "ZAMORA", "HUXLEY"];

const clampF = (v, a, b) => (v < a ? a : v > b ? b : v);

export function buildLeague(seed = LEAGUE_SEED) {
  const rnd = mulberry32(seed);
  const pool = SURNAMES.slice();
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    const t = pool[i]; pool[i] = pool[j]; pool[j] = t;
  }
  const INITS = "ABCDEGJKLMNRSTZ";
  let ni = 0;
  return TEAM_DEFS.map((td, ti) => {
    const lineup = [];
    for (let i = 0; i < 5; i++) {
      const base = ROLE_BASE_ATTRS[i], attrs = {};
      for (const k in base) {
        let v = base[k] + (td.style[k] || 0) + (k === "height" ? 0 : td.tier)
          + (rnd() * .12 - .06) * (k === "height" ? .5 : 1);
        attrs[k] = k === "height" ? clampF(v, .9, 1.12) : clampF(v, .25, .99);
      }
      lineup.push(makePlayerSpec({
        id: td.abbr.toLowerCase() + "-" + i,
        name: INITS[Math.floor(rnd() * INITS.length)] + ". " + pool[ni++],
        role: ROLES[i],
        attrs: clampAttrs(attrs),
      }));
    }
    return {
      id: "team-" + ti,
      city: td.city, name: td.name, abbr: td.abbr,
      colors: { primary: td.col, secondary: td.col2, ui: td.ui },
      lineup,
    };
  });
}

export function teamOvr(team) {
  let s = 0;
  for (const p of team.lineup) s += ovrOf(p.attrs);
  return Math.round(s / team.lineup.length);
}

/* TeamSpec for the contract from a league team (top `sides` players by fit). */
export function toTeamSpec(team, sides = 5) {
  return {
    id: team.id,
    name: team.city + " " + team.name,
    abbr: team.abbr,
    colors: team.colors,
    lineup: team.lineup.slice(0, Math.max(sides, Math.min(5, team.lineup.length))),
  };
}
