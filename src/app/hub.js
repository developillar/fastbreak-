/* App hub — the thin shell that proves the P0/P1 stack end-to-end:
   MyPlayer (create/upgrade/badges) -> MatchConfig -> engine (playable or
   headless) -> MatchResult -> rewards -> save blob. Park and MyCareer will
   be additional consumers of exactly these seams. */

import { makeMatchConfig, validateMatchResult } from "../core/contract.js";
import { buildLeague, toTeamSpec, teamOvr } from "../core/league.js";
import { simulate } from "../engine/headless.js";
import { ATTR_KEYS, ATTR_LABELS, rateAttr } from "../core/attributes.js";
import { ARCHETYPES, POSITIONS, TIER_NAMES } from "../player/archetypes.js";
import { BADGES } from "../player/badges.js";
import {
  createMyPlayer, myPlayerOvr, capsOf, canUpgrade, spendUP,
  canUnlockBadge, unlockBadge, toPlayerSpec, applyMatchRewards, badgeAccessOf,
} from "../player/myplayer.js";
import { SaveStore } from "../save/store.js";

const $ = id => document.getElementById(id);
const store = new SaveStore();
const league = buildLeague();
let save = null;

/* ---------------- boot ---------------- */
init();
async function init() {
  save = await store.load();
  $("saveKind").textContent = "SAVE: " + store.backend.kind.toUpperCase();
  wireHome();
  wireCreate();
  renderHome();
  consumePlayableResult();
  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
}

/* ---------------- views ---------------- */
const VIEWS = ["viewHome", "viewCreate", "viewUpgrade", "viewBadges", "viewResult"];
function show(view) {
  for (const v of VIEWS) $(v).classList.toggle("hidden", v !== view);
}
function toast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove("show"), 2600);
}

/* ---------------- home ---------------- */
function wireHome() {
  $("btnCreate").addEventListener("click", () => { renderCreate(); show("viewCreate"); });
  $("btnUpgrade").addEventListener("click", () => { renderUpgrades(); show("viewUpgrade"); });
  $("btnBadges").addEventListener("click", () => { renderBadges(); show("viewBadges"); });
  $("btnUpBack").addEventListener("click", () => { renderHome(); show("viewHome"); });
  $("btnBadgeBack").addEventListener("click", () => { renderHome(); show("viewHome"); });
  $("btnResBack").addEventListener("click", () => { renderHome(); show("viewHome"); });
  $("btnPlay").addEventListener("click", () => launchPlayable(false));
  $("btnClassic").addEventListener("click", () => launchPlayable(true));
  $("btnSim").addEventListener("click", runSim);
}

function renderHome() {
  const mp = save.myPlayer;
  $("mpNone").classList.toggle("hidden", !!mp);
  $("mpSome").classList.toggle("hidden", !mp);
  if (mp) {
    $("mpName").textContent = mp.name + " · " + mp.position + " · " + ARCHETYPES[mp.archetypeId].label;
    $("mpOvr").textContent = "OVR " + myPlayerOvr(mp);
    $("mpCur").textContent = mp.up + " UP · " + mp.rep + " REP";
    const t = mp.totals;
    $("mpTotals").textContent = t.games + " GP · " + t.wins + " W · " + t.pts + " PTS";
  }
}

/* ---------------- create flow ---------------- */
let cSel = { pos: "SG", arch: "sharpshooter" };
function wireCreate() {
  $("btnCancelCreate").addEventListener("click", () => show("viewHome"));
  $("btnDoCreate").addEventListener("click", () => {
    try {
      const mp = createMyPlayer({ name: $("cName").value, position: cSel.pos, archetypeId: cSel.arch });
      mp.createdAt = Date.now();
      save.myPlayer = mp;
      store.save(save);
      toast("WELCOME TO THE LEAGUE, " + mp.name);
      renderHome(); show("viewHome");
    } catch (e) { toast(e.message.toUpperCase()); }
  });
}
function renderCreate() {
  const posEl = $("cPos");
  posEl.innerHTML = POSITIONS.map(p => `<div data-p="${p}" class="${p === cSel.pos ? "on" : ""}">${p}</div>`).join("");
  posEl.querySelectorAll("div").forEach(el => el.addEventListener("click", () => { cSel.pos = el.dataset.p; renderCreate(); }));
  const archEl = $("cArch");
  archEl.innerHTML = `<div class="seg" style="flex-wrap:wrap">` +
    Object.values(ARCHETYPES).map(a =>
      `<div style="flex:1 1 30%" data-a="${a.id}" class="${a.id === cSel.arch ? "on" : ""}">${a.label}</div>`).join("") + `</div>`;
  archEl.querySelectorAll("[data-a]").forEach(el => el.addEventListener("click", () => { cSel.arch = el.dataset.a; renderCreate(); }));
  $("cArchBlurb").textContent = ARCHETYPES[cSel.arch].blurb;
}

/* ---------------- upgrades ---------------- */
function renderUpgrades() {
  const mp = save.myPlayer;
  $("upBal").textContent = mp.up + " UP";
  $("upList").innerHTML = ATTR_KEYS.filter(k => k !== "height").map(k => {
    const cur = rateAttr(k, mp.attrs[k]);
    const cap = rateAttr(k, capsOf(mp)[k]);
    const c = canUpgrade(mp, k);
    return `<div class="arow"><span>${ATTR_LABELS[k]}</span>
      <span style="height:5px;border-radius:3px;background:rgba(255,255,255,.08);overflow:hidden">
        <span style="display:block;height:100%;width:${(cur - 25) / 74 * 100}%;background:var(--you)"></span></span>
      <b>${cur}<span class="cap">/${cap}</span></b>
      <span class="plus ${c.ok ? "" : "dis"}" data-k="${k}">+1 · ${c.ok ? c.cost + "UP" : "—"}</span></div>`;
  }).join("");
  $("upList").querySelectorAll(".plus").forEach(el => el.addEventListener("click", () => {
    try { spendUP(save.myPlayer, el.dataset.k); store.save(save); renderUpgrades(); }
    catch (e) { toast(e.message.toUpperCase()); }
  }));
}

/* ---------------- badges ---------------- */
function renderBadges() {
  const mp = save.myPlayer;
  $("repBal").textContent = mp.rep + " REP";
  const access = badgeAccessOf(mp);
  $("badgeList").innerHTML = Object.values(BADGES).map(b => {
    const max = access[b.id] ?? 0;
    if (max === 0) return "";
    const cur = mp.badges[b.id] ?? 0;
    const c = canUnlockBadge(mp, b.id);
    return `<div class="brow"><span class="nm">${b.label}<i>${b.blurb}</i></span>
      <span class="tier">${TIER_NAMES[cur]}</span>
      <span class="buy ${c.ok ? "" : "dis"}" data-b="${b.id}">${c.ok ? c.cost + " REP" : (cur >= max ? "MAX" : "—")}</span></div>`;
  }).join("");
  $("badgeList").querySelectorAll(".buy").forEach(el => el.addEventListener("click", () => {
    try { unlockBadge(save.myPlayer, el.dataset.b); store.save(save); renderBadges(); }
    catch (e) { toast(e.message.toUpperCase()); }
  }));
}

/* ---------------- match config assembly ---------------- */
function nextConfig({ classic = false } = {}) {
  const mp = classic ? null : save.myPlayer;
  const homeTeam = toTeamSpec(league[0]);
  const awayTeam = toTeamSpec(league[1 + Math.floor(Math.random() * (league.length - 1))]);
  let myPlayer = null;
  if (mp) {
    const spec = toPlayerSpec(mp);
    const slot = Math.max(0, POSITIONS.indexOf(mp.position));
    homeTeam.lineup = homeTeam.lineup.slice();
    homeTeam.lineup[slot] = spec;
    myPlayer = { side: "home", index: slot };
  }
  return makeMatchConfig({
    seed: (Math.random() * 0xffffffff) >>> 0,
    home: homeTeam,
    away: awayTeam,
    difficulty: save.settings.diff ?? 1,
    rules: { quarterLength: save.settings.qlen ?? 120 },
    myPlayer,
    objectives: mp ? [
      { id: "obj-pts", type: "points", target: 12 },
      { id: "obj-win", type: "team_win" },
    ] : [],
    meta: { label: "QUICK MATCH vs " + awayTeam.abbr, returnUrl: "../index.html" },
  });
}

/* ---------------- playable engine launch/return ---------------- */
function launchPlayable(classic) {
  if (!classic && !save.myPlayer) { toast("CREATE A MYPLAYER FIRST (OR PLAY CLASSIC)"); return; }
  if (classic) {
    sessionStorage.removeItem("fb5.matchConfig");
    location.href = "game/fastbreak5v5.html";
    return;
  }
  const cfg = nextConfig({ classic });
  sessionStorage.setItem("fb5.matchConfig", JSON.stringify(cfg));
  sessionStorage.removeItem("fb5.matchResult");
  location.href = "game/fastbreak5v5.html";
}

function consumePlayableResult() {
  const raw = sessionStorage.getItem("fb5.matchResult");
  if (!raw) return;
  sessionStorage.removeItem("fb5.matchResult");
  sessionStorage.removeItem("fb5.matchConfig");
  try {
    const result = JSON.parse(raw);
    validateMatchResult(result);
    afterMatch(result);
    renderResult(result);
    show("viewResult");
  } catch (e) { console.error("bad matchResult", e); }
}

/* ---------------- headless sim ---------------- */
function runSim() {
  const cfg = nextConfig({ classic: !save.myPlayer });
  const result = simulate(cfg);
  afterMatch(result);
  renderResult(result);
  show("viewResult");
}

function afterMatch(result) {
  if (save.myPlayer && result.myPlayer) {
    const earned = applyMatchRewards(save.myPlayer, result);
    store.save(save);
    if (earned.up || earned.rep) toast(`+${earned.up} UP · +${earned.rep} REP`);
  }
}

/* ---------------- result view ---------------- */
function renderResult(r) {
  $("resTitle").textContent = (r.engine === "headless" ? "SIMULATED · " : "") + "FINAL";
  $("resScore").textContent = r.score.home + " — " + r.score.away;
  $("resMeta").textContent = (r.meta?.label || "") + " · " +
    r.periods.map(p => p.home + "-" + p.away).join("  ");
  const mp = r.myPlayer;
  $("resGrade").innerHTML = mp ? `<div class="fmeta" style="color:var(--good)">
      GRADE ${mp.grade} (${mp.gradeScore}) · ${mp.teamWon ? "WIN" : "LOSS"} ·
      ${mp.objectives.map(o => (o.met ? "✓" : "✗") + " " + o.type).join(" · ")}
    </div>` : "";
  const table = side => `<table><tr><th>${side.toUpperCase()}</th><th>PTS</th><th>REB</th><th>AST</th><th>STL</th><th>BLK</th><th>TOV</th><th>FG</th><th>3PT</th></tr>` +
    r.boxScore[side].map(l =>
      `<tr${l.id === "myplayer" ? ' style="color:var(--amber)"' : ""}><td>${l.name}</td><td>${l.pts}</td><td>${l.reb}</td><td>${l.ast}</td><td>${l.stl}</td><td>${l.blk}</td><td>${l.tov}</td><td>${l.fgm}/${l.fga}</td><td>${l.tpm}/${l.tpa}</td></tr>`).join("") + "</table>";
  $("resBox").innerHTML = table("home") + "<div style='height:8px'></div>" + table("away");
  $("resHl").innerHTML = (r.highlights || []).slice(0, 8).map(h =>
    `<div class="hl"><b>${h.type.replace(/_/g, " ").toUpperCase()}</b> — ${h.playerName}</div>`).join("");
}
