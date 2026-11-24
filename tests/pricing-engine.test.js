const test = require("node:test");
const assert = require("node:assert/strict");
const engine = require("../js/calculations/pricing-engine.js");

const near = (actual, expected, epsilon = 0.000001) =>
  assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} not within ${epsilon} of ${expected}`);

test("approved commercial model calculates discount first and VMS on discounted bill", () => {
  const result = engine.calculateMargin({
    payRate: 60, grossBillRate: 100,
    clientDiscountPct: 5, vmsFeePct: 3, overheadPct: 20
  });
  near(result.breakdown.clientDiscountAmount, 5);
  near(result.breakdown.discountedBillRate, 95);
  near(result.breakdown.vmsFeeAmount, 2.85);
  near(result.breakdown.netRevenue, 92.15);
  near(result.breakdown.loadedPayCost, 72);
  near(result.breakdown.grossProfit, 20.15);
  near(result.metrics.grossMarginPct, (20.15 / 92.15) * 100);
});

test("default overhead is 25 percent when omitted", () => {
  const result = engine.calculateMargin({ payRate: 60, grossBillRate: 100 });
  near(result.breakdown.loadedPayCost, 75);
  near(result.breakdown.overheadAmount, 15);
});

test("maximum pay calculation supports markup pricing", () => {
  const result = engine.calculateMaximumPay({
    maxGrossBillRate: 100, clientDiscountPct: 5, vmsFeePct: 3,
    overheadPct: 25, strategy: "markup", markupPct: 20
  });
  near(result.theoreticalPayRate, (92.15 / 1.2) / 1.25);
  assert.ok(result.practicalPayRate <= result.theoreticalPayRate);
  assert.equal(result.metrics.profitability, "profitable");
});

test("maximum pay calculation supports desired gross profit", () => {
  const result = engine.calculateMaximumPay({
    maxGrossBillRate: 100, clientDiscountPct: 5, vmsFeePct: 3,
    overheadPct: 25, strategy: "desiredProfit", desiredProfit: 20
  });
  near(result.theoreticalPayRate, (92.15 - 20) / 1.25);
  assert.ok(result.practicalPayRate <= result.theoreticalPayRate);
});

test("bill rate calculation supports markup pricing", () => {
  const result = engine.calculateBillRate({
    payRate: 60, clientDiscountPct: 5, vmsFeePct: 3,
    overheadPct: 25, strategy: "markup", markupPct: 20
  });
  const expectedNetRevenue = 75 * 1.2;
  near(result.theoreticalGrossBillRate, expectedNetRevenue / (0.95 * 0.97));
  assert.ok(result.practicalGrossBillRate >= result.theoreticalGrossBillRate);
  assert.ok(result.breakdown.grossProfit >= 75 * 0.2 - 0.000001);
});

test("bill rate calculation supports desired gross profit", () => {
  const result = engine.calculateBillRate({
    payRate: 60, clientDiscountPct: 5, vmsFeePct: 3,
    overheadPct: 25, strategy: "desiredProfit", desiredProfit: 25
  });
  near(result.requiredNetRevenue, 100);
  assert.ok(result.practicalGrossBillRate >= result.theoreticalGrossBillRate);
});

test("margin analysis correctly classifies loss and break-even", () => {
  const loss = engine.calculateMargin({ payRate: 100, grossBillRate: 100, overheadPct: 25 });
  assert.equal(loss.metrics.profitability, "loss");
  const even = engine.calculateMargin({ payRate: 80, grossBillRate: 100, overheadPct: 25 });
  assert.equal(even.metrics.profitability, "break-even");
  near(even.metrics.grossMarginPct, 0);
});

test("rejects invalid percentage and negative rates", () => {
  assert.throws(() => engine.calculateMargin({
    payRate: 10, grossBillRate: 100, clientDiscountPct: 101
  }), engine.PricingValidationError);
  assert.throws(() => engine.calculateMargin({
    payRate: -1, grossBillRate: 100
  }), engine.PricingValidationError);
});

test("rejects 100 percent combined deduction that leaves no net revenue", () => {
  assert.throws(() => engine.calculateMargin({
    payRate: 10, grossBillRate: 100, clientDiscountPct: 100
  }), /no positive net revenue/);
});

test("rejects desired profit above the available net revenue", () => {
  assert.throws(() => engine.calculateMaximumPay({
    maxGrossBillRate: 100, strategy: "desiredProfit", desiredProfit: 500
  }), /exceeds available net revenue/);
});

test("desired profit is constrained to the approved $0–$500 range", () => {
  assert.throws(() => engine.calculateBillRate({
    payRate: 60, strategy: "desiredProfit", desiredProfit: 501
  }), /between \$0 and \$500/);
});

test("practical bill rate rounds up and practical pay rate rounds down", () => {
  const bill = engine.calculateBillRate({
    payRate: 60.01, overheadPct: 25, strategy: "desiredProfit", desiredProfit: 17.13
  });
  assert.ok(bill.practicalGrossBillRate >= bill.theoreticalGrossBillRate);
  const pay = engine.calculateMaximumPay({
    maxGrossBillRate: 100, overheadPct: 25, strategy: "desiredProfit", desiredProfit: 17.13
  });
  assert.ok(pay.practicalPayRate <= pay.theoreticalPayRate);
});

test("formatters produce USD and percentage strings", () => {
  assert.equal(engine.formatCurrency(92.15), "$92.15");
  assert.equal(engine.formatPercent(18.612), "18.61%");
});
