const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const ui = fs.readFileSync(path.join(root, "js", "ui.js"), "utf8");

test("HTML loads the pricing engine before the UI integration script", () => {
  const engineAt = html.indexOf('src="js/calculations/pricing-engine.js"');
  const uiAt = html.indexOf('src="js/ui.js"');
  assert.ok(engineAt >= 0 && uiAt > engineAt);
});

test("all three calculator cards exist exactly once", () => {
  for (const kind of ["pay", "bill", "margin"]) {
    assert.equal((html.match(new RegExp(`data-calculator="${kind}"`, "g")) || []).length, 1);
  }
});

test("calculator cards expose calculate, reset and copy controls", () => {
  for (const action of ["calculate", "reset", "copy"]) {
    assert.ok(html.includes(`data-action="${action}"`), `missing ${action} control`);
  }
});

test("all calculators have accessible result announcements and error regions", () => {
  assert.equal((html.match(/class="calculator-error" role="alert" aria-live="polite"/g) || []).length, 3);
  assert.equal((html.match(/class="result-panel" aria-live="polite"/g) || []).length, 3);
});

test("all referenced local script and stylesheet assets exist", () => {
  const references = [...html.matchAll(/(?:src|href)="(js|css)\/([^"]+)"/g)];
  for (const match of references) {
    const assetPath = path.join(root, match[1], match[2]);
    assert.ok(fs.existsSync(assetPath), `missing asset: ${assetPath}`);
  }
});

test("UI integration uses all three shared engine entry points", () => {
  for (const fn of ["calculateMaximumPay", "calculateBillRate", "calculateMargin"]) {
    assert.ok(ui.includes(`engine.${fn}`));
  }
});

test("no inline event handlers are introduced", () => {
  assert.equal(/\son(?:click|input|change|submit)\s*=/i.test(html), false);
});
