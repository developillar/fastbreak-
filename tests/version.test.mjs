import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/* the four version stamps must never drift — a mismatch either breaks the
   self-heal update check or leaves stale clients stranded */
test("version stamps agree across sw.js, version.json, index.html, hub.js", () => {
  const sw = readFileSync("sw.js", "utf8").match(/VERSION = "fb5-v([\d.]+)"/)?.[1];
  const beacon = JSON.parse(readFileSync("version.json", "utf8")).version;
  const footer = readFileSync("index.html", "utf8").match(/>V([\d.]+)</)?.[1];
  const hub = readFileSync("src/app/hub.js", "utf8").match(/APP_VERSION = "([\d.]+)"/)?.[1];
  assert.ok(sw && beacon && footer && hub, JSON.stringify({ sw, beacon, footer, hub }));
  assert.equal(sw, beacon, "sw.js vs version.json");
  assert.equal(beacon, footer, "version.json vs index.html footer");
  assert.equal(footer, hub, "index.html vs hub.js APP_VERSION");
});
