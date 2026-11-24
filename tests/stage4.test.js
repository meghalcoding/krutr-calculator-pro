const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const storage = fs.readFileSync(path.join(root, "js/storage.js"), "utf8");
const stage4 = fs.readFileSync(path.join(root, "js/stage4.js"), "utf8");

test("Stage 4 scripts load after the financial engine and Stage 3 UI", () => {
  const engineAt = html.indexOf('src="js/calculations/pricing-engine.js"');
  const uiAt = html.indexOf('src="js/ui.js"');
  const stage4At = html.indexOf('src="js/stage4.js"');
  assert.ok(engineAt >= 0 && uiAt > engineAt && stage4At > uiAt);
});

test("preset and history controls are present and uniquely identified", () => {
  for (const id of ["presetList","historyList","createPreset","importPresets","exportPresets","presetFile",
    "viewHistory","exportHistory","clearHistory","presetDialog","presetForm","appNotice"]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]);
  assert.equal(ids.length, new Set(ids).size, "HTML IDs must be unique");
});

test("storage uses versioned IndexedDB stores with a localStorage fallback", () => {
  assert.match(storage, /indexedDB\.open\(DB_NAME,\s*DB_VERSION\)/);
  assert.match(storage, /createObjectStore\("presets"/);
  assert.match(storage, /createObjectStore\("calculations"/);
  assert.match(storage, /localStorage/);
});

test("Stage 4 wires preset CRUD, JSON import/export, history and CSV export", () => {
  for (const pattern of [
    /storage\.put\("presets"/, /storage\.remove\("presets"/, /storage\.all\("presets"/,
    /JSON\.parse/, /krutr-client-presets\.json/, /storage\.put\("calculations"/,
    /storage\.remove\("calculations"/, /storage\.clear\("calculations"/,
    /krutr-calculation-history\.csv/, /reopenCalculation/
  ]) assert.match(stage4, pattern);
});

test("calculations are saved from Calculate clicks rather than live input previews", () => {
  assert.match(stage4, /saveCalculation\(card\)/);
  assert.match(stage4, /data-action="calculate"/);
});
