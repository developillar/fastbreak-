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
  SKIN_TONES, BUILDS, HAIR_STYLES, HAIR_COLORS, BEARDS, BANDS,
  heightRange, wingspanRange, formatHeight,
  defaultBody, sanitizeBody, bodyMods, toLook,
} from "../player/body.js";
import { drawFace } from "../player/face.js";
import { drawSceneBg } from "./scenes.js";
import {
  createMyPlayer, myPlayerOvr, capsOf, canUpgrade, spendUP,
  canUnlockBadge, unlockBadge, toPlayerSpec, applyMatchRewards, badgeAccessOf,
} from "../player/myplayer.js";
import { SaveStore } from "../save/store.js";
import {
  startCareer, currentEvent, completeScene, careerGameConfig,
  recordGame, runSimBlock, careerContext, interpolate, STORY,
} from "../career/career.js";
import {
  COURTS, courtById, parkGameConfig, recordParkGame, ensurePark,
  tierOf, tierProgress, PARK_TIERS,
} from "../park/park.js";

const APP_VERSION = "0.12.1";   // keep in sync with sw.js / version.json / footer
const $ = id => document.getElementById(id);
const store = new SaveStore();
const league = buildLeague();
let save = null;

/* ---------------- boot ---------------- */
init();
async function init() {
  save = await store.load();
  const sk = $("saveKind");
  if (sk) sk.textContent = "SAVE: " + store.backend.kind.toUpperCase();
  // page/script skew: the HTML footer carries the page's version; if it
  // disagrees with this script we're a mixed-version load — resync now
  const pageV = $("verTag")?.textContent?.replace(/^V/, "");
  if (pageV && pageV !== APP_VERSION) forceRefresh(pageV);
  wireHome();
  wireCreate();
  wireCutscene();
  renderHome();
  consumePlayableResult();
  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    /* when an updated SW takes control (skipWaiting+claim in sw.js), reload
       once so users see new deploys on next launch instead of two launches
       later. hadController=false means first-ever install: no reload. */
    const hadController = !!navigator.serviceWorker.controller;
    let refreshed = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (!hadController || refreshed) return;
      refreshed = true;
      location.reload();
    });
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
  checkForUpdate();
}

/* self-heal: the version beacon bypasses every cache (SW exempts it, and
   we ask no-store), so a stale client can always discover the truth. On
   mismatch: nudge the SW, purge caches, reload — once per session, so a
   propagating CDN can never cause a reload loop. */
async function checkForUpdate() {
  try {
    const res = await fetch("version.json?ts=" + Date.now(), { cache: "no-store" });
    const v = (await res.json()).version;
    if (!v || v === APP_VERSION) { sessionStorage.removeItem("fb5.updReload"); return; }
    forceRefresh(v);
  } catch {}
}
function forceRefresh(v) {
  if (sessionStorage.getItem("fb5.updReload")) return;   // once per session, no loops
  sessionStorage.setItem("fb5.updReload", "1");
  try { toast("UPDATING TO V" + v + " …"); } catch {}
  try {
    navigator.serviceWorker?.getRegistrations?.()
      .then(regs => regs.forEach(r => r.update().catch(() => {})))
      .catch(() => {});
  } catch {}
  setTimeout(async () => {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
    } catch {}
    location.reload();
  }, 2200);
}

/* ---------------- views ---------------- */
const VIEWS = ["viewHome", "viewCreate", "viewUpgrade", "viewBadges", "viewResult", "viewCareer", "viewCutscene", "viewPark", "viewSettings"];
let resultReturnView = "viewHome";   // where BACK on the result screen goes
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
  $("btnCreate")?.addEventListener("click", () => { renderCreate(); show("viewCreate"); });
  $("btnUpgrade")?.addEventListener("click", () => { renderUpgrades(); show("viewUpgrade"); });
  $("btnBadges")?.addEventListener("click", () => { renderBadges(); show("viewBadges"); });
  $("btnUpBack")?.addEventListener("click", () => { renderHome(); show("viewHome"); });
  $("btnBadgeBack")?.addEventListener("click", () => { renderHome(); show("viewHome"); });
  $("btnResBack")?.addEventListener("click", () => {
    if (resultReturnView === "viewCareer" && save.career) { renderCareer(); show("viewCareer"); }
    else if (resultReturnView === "viewPark" && save.park) { renderPark(); show("viewPark"); }
    else { renderHome(); show("viewHome"); }
  });
  $("btnCareer")?.addEventListener("click", openCareer);
  $("btnCareerBack")?.addEventListener("click", () => { renderHome(); show("viewHome"); });
  $("btnPark")?.addEventListener("click", openPark);
  $("btnParkBack")?.addEventListener("click", () => { renderHome(); show("viewHome"); });
  $("btnPlay")?.addEventListener("click", () => launchPlayable(false));
  $("btnClassic")?.addEventListener("click", () => launchPlayable(true));
  $("btnSim")?.addEventListener("click", runSim);
  $("btnSettings")?.addEventListener("click", () => { renderSettings(); show("viewSettings"); });
  $("btnSetBack")?.addEventListener("click", () => { renderHome(); show("viewHome"); });
  $("btnReset")?.addEventListener("click", async () => {
    if (!confirm("Delete your MyPlayer and ALL progress? This cannot be undone.")) return;
    save = await store.reset();
    sessionStorage.removeItem("fb5.matchConfig");
    sessionStorage.removeItem("fb5.matchResult");
    toast("SAVE WIPED — FRESH START");
    renderHome(); show("viewHome");
  });
}

function renderHome() {
  const mp = save.myPlayer;
  $("mpNone").classList.toggle("hidden", !!mp);
  $("mpSome").classList.toggle("hidden", !mp);
  // career tile state (nodes may be absent on a mixed-version page)
  if (save.career && $("careerPill")) {
    const cur = currentEvent(save.career);
    $("careerPill").textContent = cur.done ? "COMPLETE" : "CH " + (cur.chapterIndex);
    $("careerSub").textContent = cur.done
      ? "LEGACY SEALED · " + save.career.record.w + "W " + save.career.record.l + "L"
      : cur.chapter.title + " · " + save.career.record.w + "W " + save.career.record.l + "L";
  }
  if (save.park && $("parkPill")) {
    const pk = save.park;
    $("parkPill").textContent = tierOf(pk.rep || 0).id;
    if (pk.games) $("parkSub").textContent =
      (pk.rep|0) + " REP · " + pk.wins + "W " + (pk.games - pk.wins) + "L" +
      (pk.streak > 1 ? " · " + pk.streak + " STRAIGHT" : "");
  }
  if (mp) {
    $("mpName").textContent = mp.name;
    $("mpSub").textContent = (mp.body ? formatHeight(mp.body.heightIn) + " · " : "") +
      mp.position + " · " + ARCHETYPES[mp.archetypeId].label;
    countUpNum($("mpOvr"), myPlayerOvr(mp));
    $("mpCur").textContent = mp.up + " UP · " + mp.rep + " REP";
    const t = mp.totals;
    $("mpTotals").textContent = t.games + " GP · " + t.wins + " W · " + t.pts + " PTS";
  }
}

/* ---------------- create flow (player builder) ---------------- */
let cSel = { pos: "SG", arch: "sharpshooter", body: defaultBody("SG", ARCHETYPES.sharpshooter) };
function wireCreate() {
  $("btnCancelCreate")?.addEventListener("click", () => show("viewHome"));
  $("btnDoCreate")?.addEventListener("click", () => {
    try {
      const mp = createMyPlayer({ name: $("cName").value, position: cSel.pos, archetypeId: cSel.arch, body: cSel.body });
      mp.createdAt = Date.now();
      save.myPlayer = mp;
      store.save(save);
      toast("WELCOME TO THE LEAGUE, " + mp.name);
      renderHome(); show("viewHome");
    } catch (e) { toast(e.message.toUpperCase()); }
  });
  $("cHeight")?.addEventListener("input", () => {
    cSel.body.heightIn = +$("cHeight").value;
    cSel.body = sanitizeBody(cSel.body, cSel.pos, ARCHETYPES[cSel.arch]); // re-clamp wingspan to new height
    renderBuilder();
  });
  $("cWing")?.addEventListener("input", () => {
    cSel.body.wingspanIn = +$("cWing").value;
    renderBuilder();
  });
}
function reBody() {
  cSel.body = sanitizeBody(cSel.body, cSel.pos, ARCHETYPES[cSel.arch]);
}
function renderCreate() {
  const posEl = $("cPos");
  posEl.innerHTML = POSITIONS.map(p => `<div data-p="${p}" class="${p === cSel.pos ? "on" : ""}">${p}</div>`).join("");
  posEl.querySelectorAll("div").forEach(el => el.addEventListener("click", () => {
    cSel.pos = el.dataset.p; reBody(); renderCreate();
  }));
  const archEl = $("cArch");
  archEl.innerHTML = `<div class="seg" style="flex-wrap:wrap">` +
    Object.values(ARCHETYPES).map(a =>
      `<div style="flex:1 1 30%" data-a="${a.id}" class="${a.id === cSel.arch ? "on" : ""}">${a.label}</div>`).join("") + `</div>`;
  archEl.querySelectorAll("[data-a]").forEach(el => el.addEventListener("click", () => {
    cSel.arch = el.dataset.a; reBody(); renderCreate();
  }));
  $("cArchBlurb").textContent = ARCHETYPES[cSel.arch].blurb;

  const buildEl = $("cBuild");
  buildEl.innerHTML = Object.values(BUILDS).map(b =>
    `<div data-b="${b.id}" class="${b.id === cSel.body.build ? "on" : ""}">${b.label}</div>`).join("");
  buildEl.querySelectorAll("div").forEach(el => el.addEventListener("click", () => {
    cSel.body.build = el.dataset.b; renderCreate();
  }));

  const skinEl = $("cSkin");
  skinEl.innerHTML = SKIN_TONES.map((hex, i) =>
    `<div class="sw ${i === cSel.body.skin ? "on" : ""}" data-s="${i}"
       style="background:#${hex.toString(16).padStart(6, "0")}"></div>`).join("");
  skinEl.querySelectorAll(".sw").forEach(el => el.addEventListener("click", () => {
    cSel.body.skin = +el.dataset.s; renderCreate();
  }));

  /* face creator */
  const hairEl = $("cHair");
  if (hairEl) {
    hairEl.innerHTML = HAIR_STYLES.map(h =>
      `<div data-h="${h.id}" class="${h.id === cSel.body.hair ? "on" : ""}">${h.label}</div>`).join("");
    hairEl.querySelectorAll("div").forEach(el => el.addEventListener("click", () => {
      cSel.body.hair = +el.dataset.h; renderCreate();
    }));
    $("cHairCol").innerHTML = HAIR_COLORS.map((hex, i) =>
      `<div class="sw ${i === cSel.body.hairColor ? "on" : ""}" data-c="${i}"
         style="background:#${hex.toString(16).padStart(6, "0")}"></div>`).join("");
    $("cHairCol").querySelectorAll(".sw").forEach(el => el.addEventListener("click", () => {
      cSel.body.hairColor = +el.dataset.c; renderCreate();
    }));
    $("cBeard").innerHTML = BEARDS.map(b =>
      `<div data-b="${b.id}" class="${b.id === cSel.body.beard ? "on" : ""}">${b.label}</div>`).join("");
    $("cBeard").querySelectorAll("div").forEach(el => el.addEventListener("click", () => {
      cSel.body.beard = +el.dataset.b; renderCreate();
    }));
    $("cBand").innerHTML = BANDS.map(b =>
      `<div data-n="${b.id}" class="${b.id === cSel.body.band ? "on" : ""}">${b.label}</div>`).join("");
    $("cBand").querySelectorAll("div").forEach(el => el.addEventListener("click", () => {
      cSel.body.band = +el.dataset.n; renderCreate();
    }));
  }

  renderBuilder();
}
/* sliders + live tradeoff readout (cheap enough to run every input tick) */
function renderBuilder() {
  const arch = ARCHETYPES[cSel.arch];
  const [hMin, hMax] = heightRange(cSel.pos, arch);
  const h = $("cHeight");
  h.min = hMin; h.max = hMax; h.value = cSel.body.heightIn;
  $("hVal").textContent = formatHeight(cSel.body.heightIn);
  const [wMin, wMax] = wingspanRange(cSel.body.heightIn);
  const w = $("cWing");
  w.min = wMin; w.max = wMax; w.value = cSel.body.wingspanIn;
  const wd = cSel.body.wingspanIn - cSel.body.heightIn;
  $("wVal").textContent = formatHeight(cSel.body.wingspanIn) + " (" + (wd >= 0 ? "+" : "") + wd + '")';

  const mods = bodyMods(cSel.body, cSel.pos, arch);
  const chips = Object.entries(mods)
    .filter(([, v]) => Math.abs(v) >= 0.005)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => {
      const pts = Math.round(v * 74); // 0..1 attr space -> rating points
      if (!pts) return "";
      return `<span class="dchip ${v > 0 ? "up" : "dn"}">${v > 0 ? "+" : ""}${pts} ${ATTR_LABELS[k]}</span>`;
    }).join("");
  $("cDeltas").innerHTML = chips || `<span class="dchip up" style="opacity:.5">NEUTRAL BUILD</span>`;

  try {
    const prev = createMyPlayer({ name: "PREVIEW", position: cSel.pos, archetypeId: cSel.arch, body: cSel.body });
    $("cOvrPrev").textContent = "OVR " + myPlayerOvr(prev);
  } catch { $("cOvrPrev").textContent = ""; }

  const fc = $("cFace");
  if (fc) drawFace(fc, toLook(cSel.body), { jersey: "#2f7bff" });
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
      <span class="bar"><i style="width:${(cur - 25) / 74 * 100}%"></i></span>
      <b>${cur}<span class="cap">/${cap}</span></b>
      <span class="plus ${c.ok ? "" : "dis"}" data-k="${k}">+1 · ${c.ok ? c.cost + " UP" : "—"}</span></div>`;
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

/* ---------------- settings ---------------- */
const QLEN_OPTS = [[60, "1:00"], [120, "2:00"], [180, "3:00"], [300, "5:00"]];
const DIFF_OPTS = [[0, "ROOKIE"], [1, "PRO"], [2, "ALL-STAR"]];
function renderSettings() {
  save.settings = save.settings || {};
  const qlen = save.settings.qlen ?? 120;
  const diff = save.settings.diff ?? 1;
  const seg = (elId, opts, cur, key) => {
    const el = $(elId);
    if (!el) return;
    el.innerHTML = opts.map(([v, label]) =>
      `<div data-v="${v}" class="${v === cur ? "on" : ""}">${label}</div>`).join("");
    el.querySelectorAll("div").forEach(d => d.addEventListener("click", () => {
      save.settings[key] = +d.dataset.v;
      store.save(save);
      renderSettings();
    }));
  };
  seg("setQlen", QLEN_OPTS, qlen, "qlen");
  seg("setDiff", DIFF_OPTS, diff, "diff");
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
  if (!raw) {
    // back with no result (quit mid-game / crash): drop stale round-trip
    // flags so the next unrelated match can't be recorded as park/career
    if (save.park?.pending || save.career?.pending) {
      if (save.park) save.park.pending = null;
      if (save.career) save.career.pending = null;
      store.save(save);
    }
    return;
  }
  sessionStorage.removeItem("fb5.matchResult");
  sessionStorage.removeItem("fb5.matchConfig");
  try {
    const result = JSON.parse(raw);
    validateMatchResult(result);
    if (save.park?.pending) {
      // returning from a playable park run
      const courtId = save.park.pending;
      save.park.pending = null;
      const r = recordParkGame(save, result, courtId, { played: true });
      store.save(save);
      toast((r.won ? "HELD COURT +" : "RAN OFF +") + r.gain + " REP" +
        (r.tierUp ? " · " + tierOf(save.park.rep).label + "!" : ""));
      resultReturnView = "viewPark";
      renderResult(result);
      show("viewResult");
      return;
    }
    const careerCur = save.career?.pending ? currentEvent(save.career) : null;
    if (careerCur && !careerCur.done && careerCur.event.type === "game") {
      // returning from a career key game: record into the story
      save.career.pending = null;
      const r = recordGame(save, result);      // rewards applied inside
      store.save(save);
      if (r.retry) toast("MUST-WIN: RUN IT BACK");
      else if (r.earned.up || r.earned.rep) toast(`+${r.earned.up} UP · +${r.earned.rep} REP`);
      resultReturnView = "viewCareer";
    } else {
      afterMatch(result);
      resultReturnView = "viewHome";
    }
    renderResult(result);
    show("viewResult");
  } catch (e) { console.error("bad matchResult", e); }
}

/* ---------------- headless sim ---------------- */
function runSim() {
  const cfg = nextConfig({ classic: !save.myPlayer });
  const result = simulate(cfg);
  afterMatch(result);
  resultReturnView = "viewHome";
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

/* =========================================================================
   MYCAREER — event card, cutscene player, key-game launch/return
   ========================================================================= */
function openCareer() {
  if (!save.myPlayer) { toast("CREATE A MYPLAYER FIRST"); return; }
  if (!save.career) {
    startCareer(save, { seed: (Math.random() * 0xffffffff) >>> 0 });
    store.save(save);
  }
  renderCareer();
  show("viewCareer");
}

function renderCareer() {
  const c = save.career;
  const cur = currentEvent(c);
  const ctx = careerContext(save, league);
  $("carRecord").textContent = c.record.w + "W — " + c.record.l + "L";

  if (cur.done) {
    $("carChapter").textContent = "CAREER COMPLETE";
    $("carBanner").innerHTML = `<b>${ctx.name}</b> · ${ctx.team}<br>` +
      `RIVALRY ${c.rivalMeter} · ${c.seenScenes.length} SCENES · ${Object.keys(c.flags).join(" · ") || "—"}`;
    $("carEvent").innerHTML = `<div class="evcard"><div class="evkind">LEGACY</div>
      <div class="evtitle">THE STORY IS TOLD</div>
      <div class="evsub">FINAL RECORD ${c.record.w}W — ${c.record.l}L</div></div>`;
  } else {
    const ch = cur.chapter, ev = cur.event;
    $("carChapter").textContent = `CH ${cur.chapterIndex} · ${ch.title}`;
    $("carBanner").innerHTML = `<b>${ctx.name}</b> · ${ctx.team} · ${ch.subtitle}`;
    if (ev.type === "scene") {
      $("carEvent").innerHTML = `<div class="evcard"><div class="evkind">CUTSCENE</div>
        <div class="evtitle">${ev.title}</div>
        <div class="evsub">STORY BEAT · TAP TO WATCH</div>
        <div class="evbtns"><div class="bigbtn" id="evPlayScene">▶ PLAY SCENE</div></div></div>`;
      $("evPlayScene")?.addEventListener("click", () => playScene(ev));
    } else if (ev.type === "game") {
      const objs = (ev.objectives || [])
        .map(o => "◆ " + o.type.replace("_", " ").toUpperCase() + (o.type === "team_win" ? "" : " " + o.target)).join("<br>");
      $("carEvent").innerHTML = `<div class="evcard"><div class="evkind">KEY GAME${ev.mustWin ? " · MUST WIN" : ""}</div>
        <div class="evtitle">${ev.label}</div>
        <div class="evsub">${interpolate(ev.opponent === "rival" ? "vs {rival}" : "OFFICIAL MATCHUP", ctx)}
          · ${["ROOKIE","PRO","ALL-STAR"][ev.difficulty ?? 1]}</div>
        <div class="evobj">${objs}</div>
        <div class="evbtns">
          <div class="bigbtn" id="evPlayGame">PLAY ›</div>
          <div class="bigbtn alt" id="evSimGame">SIM</div>
        </div></div>`;
      $("evPlayGame")?.addEventListener("click", launchCareerGame);
      $("evSimGame")?.addEventListener("click", simCareerGame);
    } else if (ev.type === "sim") {
      $("carEvent").innerHTML = `<div class="evcard"><div class="evkind">SEASON BLOCK</div>
        <div class="evtitle">${ev.label}</div>
        <div class="evsub">${ev.count} GAMES · ONE TAP</div>
        <div class="evbtns"><div class="bigbtn alt" id="evSimBlock">SIM ${ev.count} GAMES ›</div></div></div>`;
      $("evSimBlock")?.addEventListener("click", () => {
        const r = runSimBlock(save, league);
        store.save(save);
        toast(`${r.w}W ${r.l}L · +${r.up} UP · +${r.rep} REP`);
        renderCareer();
      });
    }
  }

  $("carHistory").innerHTML = c.history.slice(-8).reverse().map(h =>
    h.type === "sim"
      ? `<div class="hrow"><span>${h.label}</span><b>${h.w}W ${h.l}L</b></div>`
      : `<div class="hrow"><span>${h.label}${h.simmed ? " (SIM)" : ""}</span>
          <b class="${h.won ? "gpos" : "gneg"}">${h.won ? "W" : "L"} ${h.score.home}-${h.score.away} · ${h.grade || ""}</b></div>`
  ).join("") || `<div class="hrow"><span>NO GAMES YET</span><b>—</b></div>`;
}

/* ---------------- cutscene player ---------------- */
/* portrait cast — speakers listed here get a face next to their words.
   YOU always renders the MyPlayer's own face-creator look. */
const CAST = {
  "SCOUT REYES":  { look: { skin: 4, hair: 4, hairColor: 3, beard: 2, band: 0 }, jersey: "#2b3242" },
  "D. AMARI":     { look: { skin: 2, hair: 3, hairColor: 0, beard: 3, band: 0 }, jersey: "#7a4fd1" },
  "COACH":        { look: { skin: 0, hair: 4, hairColor: 3, beard: 0, band: 0 }, jersey: "#1d2a45" },
  "REPORTER":     { look: { skin: 1, hair: 0, hairColor: 1, beard: 0, band: 0 }, jersey: "#3a2f52" },
  "COMMISSIONER": { look: { skin: 3, hair: 0, hairColor: 3, beard: 1, band: 0 }, jersey: "#20263a" },
};
const cs = { scene: null, line: 0 };
function playScene(scene) {
  cs.scene = scene; cs.line = 0;
  const bg = $("csBg");
  if (bg) drawSceneBg(bg, scene.bg || "blacktop");
  renderCutsceneLine();
  show("viewCutscene");
}
function renderCutsceneLine() {
  const ctx = careerContext(save, league);
  const cur = currentEvent(save.career);
  $("csTag").textContent = (cur.done ? "" : `CH ${cur.chapterIndex} · ${cur.chapter.title} — `) + cs.scene.title;
  const line = cs.scene.lines[cs.line];
  const speaker = interpolate(line.speaker, ctx);
  $("csSpeaker").textContent = speaker;
  // portrait: the cast table, or the MyPlayer's own face for YOU / their name
  const fc = $("csFace");
  if (fc) {
    let who = CAST[speaker] || null;
    if (speaker === "YOU" || (save.myPlayer && speaker === save.myPlayer.name)) {
      who = save.myPlayer?.body
        ? { look: toLook(save.myPlayer.body), jersey: "#2f7bff" } : null;
    }
    fc.classList.toggle("none", !who);
    if (who) drawFace(fc, who.look, { jersey: who.jersey });
  }
  // word-by-word reveal (full text lands in the DOM immediately; only the
  // opacity is staggered, so taps/tests never race the animation)
  const words = interpolate(line.text, ctx).split(/(\s+)/);
  let wi = 0;
  $("csText").innerHTML = words.map(w =>
    /^\s+$/.test(w) ? w
      : `<span class="tw" style="animation-delay:${Math.min(2400, wi++ * 42)}ms">${w
          .replace(/&/g, "&amp;").replace(/</g, "&lt;")}</span>`).join("");
  const atEnd = cs.line >= cs.scene.lines.length - 1;
  const hasChoice = atEnd && cs.scene.choice;
  $("csHint").style.display = hasChoice ? "none" : "block";
  $("csHint").textContent = atEnd ? "TAP TO END SCENE ›" : "TAP TO CONTINUE ›";
  const ch = $("csChoices");
  ch.style.display = hasChoice ? "flex" : "none";
  if (hasChoice) {
    ch.innerHTML = `<div class="evkind" style="margin-top:2px">${interpolate(cs.scene.choice.prompt, ctx)}</div>` +
      cs.scene.choice.options.map(o =>
        `<div class="csopt" data-c="${o.id}">${interpolate(o.text, ctx)}</div>`).join("");
    ch.querySelectorAll(".csopt").forEach(el => el.addEventListener("click", e => {
      e.stopPropagation();
      endScene(el.dataset.c);
    }));
  }
}
function endScene(choiceId) {
  completeScene(save, choiceId);
  store.save(save);
  cs.scene = null;
  renderCareer();
  show("viewCareer");
}
function wireCutscene() {
  $("viewCutscene")?.addEventListener("click", () => {
    if (!cs.scene) return;
    const atEnd = cs.line >= cs.scene.lines.length - 1;
    if (atEnd) {
      if (!cs.scene.choice) endScene(null);   // choices handle themselves
    } else {
      cs.line++;
      renderCutsceneLine();
    }
  });
}

/* ---------------- career key games ---------------- */
function launchCareerGame() {
  const cfg = careerGameConfig(save, league);
  cfg.meta.returnUrl = "../index.html";
  save.career.pending = { eventId: currentEvent(save.career).event.id };
  store.save(save).then(() => {
    sessionStorage.setItem("fb5.matchConfig", JSON.stringify(cfg));
    sessionStorage.removeItem("fb5.matchResult");
    location.href = "game/fastbreak5v5.html";
  });
}
function simCareerGame() {
  const cfg = careerGameConfig(save, league);
  const result = simulate(cfg);
  const r = recordGame(save, result, { simmed: true });
  store.save(save);
  if (r.retry) toast("MUST-WIN: RUN IT BACK");
  else if (r.earned.up || r.earned.rep) toast(`+${r.earned.up} UP · +${r.earned.rep} REP (SIM)`);
  resultReturnView = "viewCareer";
  renderResult(result);
  show("viewResult");
}

/* =========================================================================
   THE PARK — court-select hub, rep ladder, BotProvider runs
   ========================================================================= */
function openPark() {
  if (!save.myPlayer) { toast("CREATE A MYPLAYER FIRST"); return; }
  ensurePark(save);
  store.save(save);
  renderPark();
  show("viewPark");
}

function renderPark() {
  const pk = ensurePark(save);
  const prog = tierProgress(pk.rep);
  $("parkTier").textContent = prog.cur.label + " · " + pk.rep + " REP";
  $("parkRepFill").style.width = (prog.frac * 100).toFixed(1) + "%";
  $("parkStats").innerHTML =
    `<b>${pk.wins}W — ${pk.games - pk.wins}L</b>` +
    (pk.streak > 1 ? ` · <span class="flame">🔥 ${pk.streak} STRAIGHT</span>` : "") +
    (pk.bestStreak > 1 ? ` · BEST RUN <b>${pk.bestStreak}</b>` : "") +
    (prog.next ? ` · NEXT: ${prog.next.label} AT ${prog.next.at}` : " · TOP OF THE LADDER");

  $("parkCourts").innerHTML = COURTS.map(c => `
    <div class="courtcard">
      <div class="cmode">${c.mode} · ${c.court === "half" ? "HALF COURT" : "FULL COURT"} · +${c.repWin} REP</div>
      <div class="ctitle">${c.label}</div>
      <div class="cblurb">${c.blurb}</div>
      <div class="evbtns">
        ${c.playable
          ? `<div class="bigbtn" data-play="${c.id}">PLAY ›</div><div class="bigbtn alt" data-run="${c.id}">SIM</div>`
          : `<div class="bigbtn" data-run="${c.id}">RUN IT ›</div>`}
      </div>
    </div>`).join("");
  $("parkCourts").querySelectorAll("[data-run]").forEach(el =>
    el.addEventListener("click", () => runParkGame(el.dataset.run)));
  $("parkCourts").querySelectorAll("[data-play]").forEach(el =>
    el.addEventListener("click", () => launchParkGame(el.dataset.play)));
}

function runParkGame(courtId) {
  const cfg = parkGameConfig(save, league, courtId);
  const result = simulate(cfg);
  const r = recordParkGame(save, result, courtId, { played: false });
  store.save(save);
  toast((r.won ? "HELD COURT +" : "RAN OFF +") + r.gain + " REP" +
    (r.tierUp ? " · " + tierOf(save.park.rep).label + "!" : ""));
  resultReturnView = "viewPark";
  renderResult(result);
  show("viewResult");
}

function launchParkGame(courtId) {
  const cfg = parkGameConfig(save, league, courtId);
  cfg.meta.returnUrl = "../index.html";
  save.park.pending = courtId;
  store.save(save).then(() => {
    sessionStorage.setItem("fb5.matchConfig", JSON.stringify(cfg));
    sessionStorage.removeItem("fb5.matchResult");
    location.href = "game/fastbreak5v5.html";
  });
}

/* ---------------- result view ---------------- */
/* count-up: numbers roll to their target (pure presentation; the real value
   is set immediately as a fallback for reduced-motion / tests) */
function countUpNum(el, to, ms = 500) {
  const from = parseInt(el.textContent, 10);
  el.textContent = to;
  if (isNaN(from) || from === to || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const t0 = performance.now();
  cancelAnimationFrame(el._cnt);
  const step = t => {
    const k = Math.min(1, (t - t0) / ms), e = 1 - Math.pow(1 - k, 3);
    el.textContent = Math.round(from + (to - from) * e);
    if (k < 1) el._cnt = requestAnimationFrame(step);
  };
  el._cnt = requestAnimationFrame(step);
}
function countUpScore(el, a, b, ms = 700) {
  el.textContent = a + " — " + b;
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const t0 = performance.now();
  cancelAnimationFrame(el._cnt);
  const step = t => {
    const k = Math.min(1, (t - t0) / ms), e = 1 - Math.pow(1 - k, 3);
    el.textContent = Math.round(a * e) + " — " + Math.round(b * e);
    if (k < 1) el._cnt = requestAnimationFrame(step);
  };
  el._cnt = requestAnimationFrame(step);
}
function renderResult(r) {
  $("resTitle").textContent = (r.engine === "headless" ? "SIMULATED · " : "") + "FINAL";
  countUpScore($("resScore"), r.score.home, r.score.away);
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
