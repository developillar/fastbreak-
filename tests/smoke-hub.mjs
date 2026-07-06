/* Hub journey smoke test: create MyPlayer -> spend UP -> sim a match ->
   rewards land -> save persists across reload. Also regression-checks the
   classic standalone game (no bridge config) still boots and plays.
   Run: node tests/smoke-hub.mjs */
import { chromium } from "playwright-core";
import { createServer } from "../tools/serve.mjs";

const PORT = 8792;
const server = createServer();
await new Promise(r => server.listen(PORT, r));

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium" });
const page = await browser.newPage({ viewport: { width: 390, height: 780 } });
const errors = [];
page.on("pageerror", e => errors.push(String(e)));

let failed = 0;
const check = (name, cond, extra = "") => {
  console.log((cond ? "  ok " : "FAIL ") + name + (cond ? "" : "  " + extra));
  if (!cond) failed++;
};

try {
  /* ---- hub: dismiss splash, create MyPlayer ---- */
  await page.goto(`http://localhost:${PORT}/index.html`);
  await page.click("#splash");
  await page.waitForSelector("#splash.gone");
  await page.click("#btnCreate");
  await page.fill("#cName", "SMOKE ROOK");
  await page.click('#cPos div[data-p="PG"]');
  await page.click('[data-a="playmaker"]');
  await page.click("#btnDoCreate");
  await page.waitForSelector("#mpSome:not(.hidden)");
  const mpName = await page.textContent("#mpName");
  const mpSub = await page.textContent("#mpSub");
  check("MyPlayer created", mpName.includes("SMOKE ROOK") && mpSub.includes("PLAYMAKER"), mpName + " / " + mpSub);

  /* ---- spend UP ---- */
  await page.click("#btnUpgrade");
  const balBefore = await page.textContent("#upBal");
  await page.click('.plus[data-k="pas"]');
  const balAfter = await page.textContent("#upBal");
  check("UP spent on PAS", parseInt(balAfter) < parseInt(balBefore), balBefore + " -> " + balAfter);
  await page.click("#btnUpBack");

  /* ---- headless sim through the hub ---- */
  await page.click("#btnSim");
  await page.waitForSelector("#viewResult:not(.hidden)");
  const score = await page.textContent("#resScore");
  check("sim produced a final score", /\d+ — \d+/.test(score), score);
  const grade = await page.textContent("#resGrade");
  check("myPlayer graded in sim", /GRADE [A-F]/.test(grade), grade);
  const boxRows = await page.locator("#resBox tr").count();
  check("box score rendered", boxRows >= 12, String(boxRows));
  await page.click("#btnResBack");

  /* ---- rewards + persistence ---- */
  const totals = await page.textContent("#mpTotals");
  check("career totals updated", totals.startsWith("1 GP"), totals);
  await page.reload();
  await page.waitForSelector("#mpSome:not(.hidden)");
  const totals2 = await page.textContent("#mpTotals");
  check("save survives reload (IndexedDB)", totals2 === totals, totals2);

  /* ---- MyCareer: cutscene -> choice -> key game -> next beat ---- */
  await page.click("#btnCareer");
  await page.waitForSelector("#viewCareer:not(.hidden)");
  check("career opens at CH 0", (await page.textContent("#carChapter")).includes("CH 0"));
  check("first event is a cutscene", (await page.textContent("#carEvent")).includes("CUTSCENE"));
  await page.click("#evPlayScene");
  await page.waitForSelector("#viewCutscene:not(.hidden)");
  const line1 = await page.textContent("#csText");
  check("cutscene renders story lines", line1.trim().length > 20 && !line1.includes("[EDIT]"), line1.slice(0, 40));
  await page.click("#viewCutscene");   // line 2
  await page.click("#viewCutscene");   // line 3
  await page.click("#viewCutscene");   // end scene
  await page.waitForSelector("#viewCareer:not(.hidden)");
  check("scene completion returns to career", (await page.textContent("#carEvent")).includes("KEY GAME"));

  // sim the must-win blacktop game until it's won (bounded retries)
  let advancedToChoice = false;
  for (let i = 0; i < 15 && !advancedToChoice; i++) {
    await page.click("#evSimGame");
    await page.waitForSelector("#viewResult:not(.hidden)");
    await page.click("#btnResBack");
    await page.waitForSelector("#viewCareer:not(.hidden)");
    advancedToChoice = (await page.textContent("#carEvent")).includes("CUTSCENE");
  }
  check("must-win game eventually advances the story", advancedToChoice);
  await page.click("#evPlayScene");
  await page.waitForSelector("#viewCutscene:not(.hidden)");
  await page.click("#viewCutscene"); // line 2 -> choice appears
  await page.waitForSelector("#csChoices .csopt");
  await page.click("#csChoices .csopt");  // pick first option
  await page.waitForSelector("#viewCareer:not(.hidden)");
  check("choice ends scene, chapter rolls to CH 1", (await page.textContent("#carChapter")).includes("CH 1"));
  await page.reload();
  await page.waitForSelector("#mpSome:not(.hidden)");
  await page.click("#btnCareer");
  await page.waitForSelector("#viewCareer:not(.hidden)");
  check("career progress persists across reload", (await page.textContent("#carChapter")).includes("CH 1"));
  await page.click("#btnCareerBack");

  /* ---- The Park: run a court, rep climbs, streak shows ---- */
  await page.click("#btnPark");
  await page.waitForSelector("#viewPark:not(.hidden)");
  check("park opens with the rep ladder", (await page.textContent("#parkTier")).includes("REP"));
  await page.click('[data-run="cage"]');
  await page.waitForSelector("#viewResult:not(.hidden)");
  await page.click("#btnResBack");
  await page.waitForSelector("#viewPark:not(.hidden)");
  const parkStats = await page.textContent("#parkStats");
  check("park game recorded", /1W|0W — 1L|1W — 0L/.test(parkStats), parkStats);
  const rep = await page.textContent("#parkTier");
  check("rep was earned", !rep.includes("· 0 REP"), rep);
  await page.click("#btnParkBack");

  /* ---- in-app save reset ---- */
  page.on("dialog", d => d.accept());
  await page.click("#btnReset");
  await page.waitForSelector("#mpNone:not(.hidden)");
  check("reset wipes the save", true);
  await page.reload();
  await page.waitForSelector("#mpNone:not(.hidden)");
  check("wipe persists after reload", true);

  /* ---- classic game boots standalone (no bridge config) ---- */
  await page.click("#btnClassic");
  await page.waitForSelector("#startBtn");
  const menuVisible = await page.evaluate(() => !document.getElementById("menu").classList.contains("hidden"));
  check("classic: menu shows (bridge dormant)", menuVisible);
  await page.click("#startBtn");
  await page.waitForFunction(() => document.getElementById("menu").classList.contains("hidden"));
  await page.waitForTimeout(3000);
  const hud = await page.evaluate(() => ({
    clock: document.getElementById("hClock").textContent,
    phase: typeof G !== "undefined" ? G.phase : "?",
  }));
  check("classic: game running", hud.phase === "play" || hud.phase === "made" || hud.phase === "break", JSON.stringify(hud));
  check("no page errors", errors.length === 0, errors.slice(0, 3).join(" | "));
} catch (e) {
  console.error("HUB SMOKE ERROR:", e.message);
  failed++;
} finally {
  await browser.close();
  server.close();
}
process.exit(failed ? 1 : 0);
