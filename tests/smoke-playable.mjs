/* End-to-end smoke test for the ENGINE-AS-SERVICE seam:
   serve the repo, load the playable game with a MatchConfig in
   sessionStorage (autoplay CPU-vs-CPU, accelerated clock), wait for the
   bridge to emit a MatchResult, then validate it against the contract.

   Run: npm run test:smoke   (~30-60s of wall clock) */
import { chromium } from "playwright-core";
import { createServer } from "../tools/serve.mjs";
import { makeMatchConfig, validateMatchResult } from "../src/core/contract.js";
import { buildLeague, toTeamSpec } from "../src/core/league.js";

const PORT = 8791;
const server = createServer();
await new Promise(r => server.listen(PORT, r));

const league = buildLeague();
const config = makeMatchConfig({
  seed: 20260703,
  home: toTeamSpec(league[0]),
  away: toTeamSpec(league[1]),
  myPlayer: { side: "home", index: 1 },
  objectives: [{ id: "o-pts", type: "points", target: 4 }],
  rules: { quarters: 1, quarterLength: 45 },
  meta: { label: "SMOKE", autoplay: true, timeScale: 3 },
});

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium" });
const page = await browser.newPage({ viewport: { width: 390, height: 780 } });
const errors = [];
page.on("pageerror", e => errors.push(String(e)));
page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });

await page.goto(`http://localhost:${PORT}/game/fastbreak5v5.html`);
await page.evaluate(cfg => sessionStorage.setItem("fb5.matchConfig", JSON.stringify(cfg)), config);
await page.reload();

let failed = 0;
const check = (name, cond, extra = "") => {
  console.log((cond ? "  ok " : "FAIL ") + name + (cond ? "" : "  " + extra));
  if (!cond) failed++;
};

try {
  // menu must be bypassed by the bridge
  await page.waitForFunction(() => document.getElementById("menu").classList.contains("hidden"), null, { timeout: 10_000 });
  console.log("bridge engaged, match running (autoplay, 3x)...");

  await page.waitForFunction(() => !!sessionStorage.getItem("fb5.matchResult"), null, { timeout: 150_000 });
  const result = JSON.parse(await page.evaluate(() => sessionStorage.getItem("fb5.matchResult")));

  check("contract: validateMatchResult", (() => { try { validateMatchResult(result); return true; } catch (e) { console.log("   " + e.message); return false; } })());
  check("engine tag", result.engine === "playable");
  check("seed echoed", result.seed === config.seed);
  check("game was decided", result.score.home !== result.score.away, JSON.stringify(result.score));
  check("scoring happened", result.score.home + result.score.away > 0);
  check("periods recorded", result.periods.length >= 1, JSON.stringify(result.periods));
  check("10 stat lines", result.boxScore.home.length === 5 && result.boxScore.away.length === 5);
  const someStats = [...result.boxScore.home, ...result.boxScore.away].some(l => l.fga > 0);
  check("field goals attempted", someStats);
  check("myPlayer graded", !!result.myPlayer && /^[A-F][+-]?$/.test(result.myPlayer.grade), JSON.stringify(result.myPlayer?.grade));
  check("myPlayer is the requested slot", result.myPlayer?.line?.id === config.home.lineup[1].id);
  check("objectives evaluated", result.myPlayer?.objectives?.length === 1 && typeof result.myPlayer.objectives[0].met === "boolean");
  check("highlights exist", result.highlights.length > 0);
  check("no page errors", errors.length === 0, errors.slice(0, 3).join(" | "));

  console.log(`\nFINAL ${result.score.home}-${result.score.away} · myPlayer ${result.myPlayer.line.pts}pts ` +
    `grade ${result.myPlayer.grade} · ${result.highlights.length} highlights · duration ${result.duration}s`);
} catch (e) {
  console.error("SMOKE TEST ERROR:", e.message);
  if (errors.length) console.error("page errors:", errors.join("\n"));
  failed++;
} finally {
  await browser.close();
  server.close();
}
process.exit(failed ? 1 : 0);
