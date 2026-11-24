/**
 * KRUTr Calculator Pro — Shared Pricing Engine
 * Version: 2.0.0
 *
 * Pure calculation functions. No DOM, storage, network or UI dependencies.
 * Commercial model:
 *   1. Client discount is deducted from gross bill rate.
 *   2. MSP/VMS fee is calculated on the discounted bill rate.
 *   3. Loaded candidate cost is pay rate plus overhead.
 *   4. Profit = net revenue - loaded candidate cost.
 *   5. Margin = profit / net revenue.
 *
 * Percentages are passed as percentage points (e.g. 5 means 5%).
 */
(function (root, factory) {
  const engine = factory();
  if (typeof module === "object" && module.exports) module.exports = engine;
  if (root) root.KRUTrPricingEngine = engine;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const RULES = Object.freeze({
    currency: "USD",
    defaultOverheadPct: 25,
    defaultDiscountPct: 0,
    defaultVmsPct: 0,
    desiredProfitMin: 0,
    desiredProfitMax: 500,
    displayDecimals: 2
  });

  class PricingValidationError extends Error {
    constructor(message, field) {
      super(message);
      this.name = "PricingValidationError";
      this.field = field || null;
    }
  }

  const finiteNumber = (value, field, label) => {
    const number = Number(value);
    if (value === "" || value === null || value === undefined || !Number.isFinite(number)) {
      throw new PricingValidationError(`${label} must be a valid number.`, field);
    }
    return number;
  };

  const nonNegative = (value, field, label) => {
    const number = finiteNumber(value, field, label);
    if (number < 0) throw new PricingValidationError(`${label} cannot be negative.`, field);
    return number;
  };

  const percentage = (value, field, label, maximum = 100) => {
    const number = finiteNumber(value, field, label);
    if (number < 0 || number > maximum) {
      throw new PricingValidationError(`${label} must be between 0% and ${maximum}%.`, field);
    }
    return number;
  };

  const money = (value, field, label) => nonNegative(value, field, label);

  const roundToCents = (value) => Math.round((value + Number.EPSILON) * 100) / 100;
  const floorToCents = (value) => Math.floor((value + 1e-10) * 100) / 100;
  const ceilToCents = (value) => Math.ceil((value - 1e-10) * 100) / 100;

  const toPercentFactor = (pct) => pct / 100;

  function normalizeCommercialInputs(input) {
    const grossBillRate = input.grossBillRate === undefined
      ? undefined
      : money(input.grossBillRate, "grossBillRate", "Gross bill rate");
    const clientDiscountPct = percentage(
      input.clientDiscountPct ?? RULES.defaultDiscountPct,
      "clientDiscountPct", "Client discount"
    );
    const vmsFeePct = percentage(
      input.vmsFeePct ?? RULES.defaultVmsPct,
      "vmsFeePct", "MSP/VMS fee"
    );
    const overheadPct = nonNegative(
      input.overheadPct ?? RULES.defaultOverheadPct,
      "overheadPct", "Pay load / overhead"
    );

    const retainedFactor = (1 - toPercentFactor(clientDiscountPct)) *
      (1 - toPercentFactor(vmsFeePct));

    if (retainedFactor <= 0) {
      throw new PricingValidationError(
        "Client discount and MSP/VMS fee leave no positive net revenue.",
        "clientDiscountPct"
      );
    }

    return { grossBillRate, clientDiscountPct, vmsFeePct, overheadPct, retainedFactor };
  }

  /**
   * Produces a full revenue/cost breakdown for a known gross bill rate and pay rate.
   * Negative profit is permitted and represented as a loss.
   */
  function analyzeRates(input) {
    const payRate = money(input.payRate, "payRate", "Candidate pay rate");
    const grossBillRate = money(input.grossBillRate, "grossBillRate", "Gross bill rate");
    if (grossBillRate <= 0) {
      throw new PricingValidationError("Gross bill rate must be greater than zero.", "grossBillRate");
    }

    const commercial = normalizeCommercialInputs(input);
    const discountAmount = grossBillRate * toPercentFactor(commercial.clientDiscountPct);
    const discountedBillRate = grossBillRate - discountAmount;
    const vmsFeeAmount = discountedBillRate * toPercentFactor(commercial.vmsFeePct);
    const netRevenue = discountedBillRate - vmsFeeAmount;
    const overheadAmount = payRate * toPercentFactor(commercial.overheadPct);
    const loadedPayCost = payRate + overheadAmount;
    const grossProfit = netRevenue - loadedPayCost;
    const grossMarginPct = netRevenue > 0 ? (grossProfit / netRevenue) * 100 : null;
    const markupPct = loadedPayCost > 0 ? (grossProfit / loadedPayCost) * 100 : null;

    return {
      inputs: {
        payRate, grossBillRate,
        clientDiscountPct: commercial.clientDiscountPct,
        vmsFeePct: commercial.vmsFeePct,
        overheadPct: commercial.overheadPct
      },
      breakdown: {
        grossBillRate,
        clientDiscountAmount: discountAmount,
        discountedBillRate,
        vmsFeeAmount,
        netRevenue,
        candidatePayRate: payRate,
        overheadAmount,
        loadedPayCost,
        grossProfit
      },
      metrics: {
        grossMarginPct,
        markupPct,
        profitability: grossProfit > 0 ? "profitable" : grossProfit < 0 ? "loss" : "break-even"
      },
      display: {
        grossBillRate: roundToCents(grossBillRate),
        clientDiscountAmount: roundToCents(discountAmount),
        discountedBillRate: roundToCents(discountedBillRate),
        vmsFeeAmount: roundToCents(vmsFeeAmount),
        netRevenue: roundToCents(netRevenue),
        candidatePayRate: roundToCents(payRate),
        overheadAmount: roundToCents(overheadAmount),
        loadedPayCost: roundToCents(loadedPayCost),
        grossProfit: roundToCents(grossProfit),
        grossMarginPct: grossMarginPct === null ? null : roundToCents(grossMarginPct),
        markupPct: markupPct === null ? null : roundToCents(markupPct)
      }
    };
  }

  function normalizeStrategy(input) {
    const strategy = input.strategy || "markup";
    if (!["markup", "desiredProfit"].includes(strategy)) {
      throw new PricingValidationError("Pricing strategy must be markup or desiredProfit.", "strategy");
    }
    if (strategy === "markup") {
      return {
        strategy,
        markupPct: nonNegative(input.markupPct, "markupPct", "Markup")
      };
    }
    const desiredProfit = money(input.desiredProfit, "desiredProfit", "Desired gross profit");
    if (desiredProfit < RULES.desiredProfitMin || desiredProfit > RULES.desiredProfitMax) {
      throw new PricingValidationError(
        `Desired gross profit must be between $${RULES.desiredProfitMin} and $${RULES.desiredProfitMax}.`,
        "desiredProfit"
      );
    }
    return { strategy, desiredProfit };
  }

  /**
   * Maximum Pay Rate:
   * markup = grossProfit / loadedPayCost
   * desiredProfit = target gross profit per hour.
   *
   * Theoretical pay is exact; practical pay is rounded DOWN to cents so
   * the target profit/margin is not accidentally breached.
   */
  function calculateMaximumPay(input) {
    const maxGrossBillRate = money(input.maxGrossBillRate, "maxGrossBillRate", "Maximum gross bill rate");
    if (maxGrossBillRate <= 0) {
      throw new PricingValidationError("Maximum gross bill rate must be greater than zero.", "maxGrossBillRate");
    }
    const commercial = normalizeCommercialInputs({
      ...input,
      grossBillRate: maxGrossBillRate
    });
    const strategy = normalizeStrategy(input);
    const discountedBillRate = maxGrossBillRate * (1 - toPercentFactor(commercial.clientDiscountPct));
    const vmsFeeAmount = discountedBillRate * toPercentFactor(commercial.vmsFeePct);
    const netRevenue = discountedBillRate - vmsFeeAmount;

    const targetLoadedCost = strategy.strategy === "markup"
      ? netRevenue / (1 + toPercentFactor(strategy.markupPct))
      : netRevenue - strategy.desiredProfit;

    if (targetLoadedCost < 0) {
      throw new PricingValidationError(
        "Desired gross profit exceeds available net revenue. Reduce the target profit.",
        "desiredProfit"
      );
    }

    const theoreticalPayRate = targetLoadedCost / (1 + toPercentFactor(commercial.overheadPct));
    const practicalPayRate = floorToCents(theoreticalPayRate);
    const practicalAnalysis = analyzeRates({
      payRate: practicalPayRate,
      grossBillRate: maxGrossBillRate,
      clientDiscountPct: commercial.clientDiscountPct,
      vmsFeePct: commercial.vmsFeePct,
      overheadPct: commercial.overheadPct
    });

    return {
      calculator: "maximumPay",
      strategy,
      theoreticalPayRate,
      practicalPayRate,
      maximumGrossBillRate: maxGrossBillRate,
      targetLoadedCost,
      analysisAtPracticalPay: practicalAnalysis,
      breakdown: practicalAnalysis.breakdown,
      metrics: practicalAnalysis.metrics,
      display: {
        theoreticalPayRate: roundToCents(theoreticalPayRate),
        practicalPayRate: roundToCents(practicalPayRate),
        targetLoadedCost: roundToCents(targetLoadedCost)
      }
    };
  }

  /**
   * Bill Rate:
   * markup target net revenue = loaded cost * (1 + markup)
   * desired profit target net revenue = loaded cost + desired profit
   *
   * Required gross bill is rounded UP to cents. Returned breakdown is
   * recalculated at the practical quoted rate.
   */
  function calculateBillRate(input) {
    const payRate = money(input.payRate, "payRate", "Candidate pay rate");
    const commercial = normalizeCommercialInputs(input);
    const strategy = normalizeStrategy(input);
    const overheadAmount = payRate * toPercentFactor(commercial.overheadPct);
    const loadedPayCost = payRate + overheadAmount;

    const requiredNetRevenue = strategy.strategy === "markup"
      ? loadedPayCost * (1 + toPercentFactor(strategy.markupPct))
      : loadedPayCost + strategy.desiredProfit;

    const theoreticalGrossBillRate = requiredNetRevenue / commercial.retainedFactor;
    const practicalGrossBillRate = ceilToCents(theoreticalGrossBillRate);
    const practicalAnalysis = analyzeRates({
      payRate,
      grossBillRate: practicalGrossBillRate,
      clientDiscountPct: commercial.clientDiscountPct,
      vmsFeePct: commercial.vmsFeePct,
      overheadPct: commercial.overheadPct
    });

    return {
      calculator: "billRate",
      strategy,
      theoreticalGrossBillRate,
      practicalGrossBillRate,
      requiredNetRevenue,
      analysisAtPracticalBill: practicalAnalysis,
      breakdown: practicalAnalysis.breakdown,
      metrics: practicalAnalysis.metrics,
      display: {
        theoreticalGrossBillRate: roundToCents(theoreticalGrossBillRate),
        practicalGrossBillRate: roundToCents(practicalGrossBillRate),
        requiredNetRevenue: roundToCents(requiredNetRevenue)
      }
    };
  }

  /**
   * Margin calculator: actual rates, actual deductions and actual loaded cost.
   */
  function calculateMargin(input) {
    const analysis = analyzeRates(input);
    return { calculator: "margin", ...analysis };
  }

  function formatCurrency(value, currency = RULES.currency, locale = "en-US") {
    if (!Number.isFinite(value)) return "—";
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(value);
  }

  function formatPercent(value) {
    if (!Number.isFinite(value)) return "—";
    return `${value.toFixed(2)}%`;
  }

  return Object.freeze({
    RULES,
    PricingValidationError,
    analyzeRates,
    calculateMaximumPay,
    calculateBillRate,
    calculateMargin,
    formatCurrency,
    formatPercent,
    rounding: Object.freeze({ roundToCents, floorToCents, ceilToCents })
  });
});
