/* Renders the app icon with headless Chromium (no native canvas dep).
   Usage: node tools/make-icons.mjs */
import { chromium } from "playwright-core";
import { fileURLToPath } from "node:url";

const out = fileURLToPath(new URL("../icons/", import.meta.url));
const html = size => `<!DOCTYPE html><body style="margin:0">
<div style="width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center;
  background:radial-gradient(120% 100% at 50% 0%,#1b2440,#05060a);
  font-family:-apple-system,system-ui,sans-serif;position:relative;overflow:hidden">
  <div style="position:absolute;width:${size * 1.15}px;height:${size * 1.15}px;border:${size * .02}px solid rgba(255,181,69,.25);
    border-radius:50%;left:${size * .35}px;top:${-size * .45}px"></div>
  <div style="text-align:center;transform:rotate(-6deg)">
    <div style="font-size:${size * .30}px;font-weight:900;font-style:italic;line-height:.9;letter-spacing:-.02em;
      background:linear-gradient(180deg,#fff,#9db8e8);-webkit-background-clip:text;color:transparent">FAST<br>BREAK</div>
    <div style="font-size:${size * .14}px;font-weight:900;color:#ffb545;letter-spacing:.35em;margin-top:${size * .02}px">5</div>
  </div>
</div></body>`;

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium" });
for (const size of [192, 512]) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(html(size));
  await page.screenshot({ path: out + `icon-${size}.png` });
  await page.close();
  console.log("icons/icon-" + size + ".png");
}
await browser.close();
