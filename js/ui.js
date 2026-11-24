/**
 * KRUTr Calculator Pro — Stage 3 calculator integration.
 * Connects independent dashboard cards to the shared pricing engine.
 * Does not implement persistence; history/presets are Stage 4.
 */
"use strict";

(() => {
  const engine = window.KRUTrPricingEngine;
  if (!engine) {
    document.body.insertAdjacentHTML(
      "afterbegin",
      '<div class="global-error" role="alert">KRUTr could not load its calculation engine. Refresh the page or check the project files.</div>'
    );
    return;
  }

  const $ = (selector, scope = document) => scope.querySelector(selector);
  const $$ = (selector, scope = document) => [...scope.querySelectorAll(selector)];
  const currency = (value) => engine.formatCurrency(value, "USD");
  const percent = (value) => Number.isFinite(value) ? engine.formatPercent(value) : "—";
  const safeText = (value) => String(value ?? "");

  const cardStates = new WeakMap();

  function getNumber(card, field, fallback = undefined) {
    const input = $(`[data-field="${field}"]`, card);
    if (!input) return fallback;
    if (input.value.trim() === "") return fallback;
    return Number(input.value);
  }

  function getStrategy(card) {
    const active = $('.strategy-option[aria-pressed="true"]', card);
    return active?.dataset.strategy || "markup";
  }

  function setError(card, message = "") {
    const box = $(".calculator-error", card);
    box.textContent = message;
    box.hidden = !message;
    card.classList.toggle("has-error", Boolean(message));
  }

  function setResult(card, key, value) {
    const node = $(`[data-result="${key}"]`, card);
    if (node) node.textContent = safeText(value);
  }

  function renderBreakdown(card, rows) {
    const list = $('[data-result="breakdown"]', card);
    list.replaceChildren();
    rows.forEach(([label, value]) => {
      const dt = document.createElement("dt");
      const dd = document.createElement("dd");
      dt.textContent = label;
      dd.textContent = value;
      list.append(dt, dd);
    });
  }

  function profitabilityLabel(status) {
    if (status === "profitable") return "Profitable";
    if (status === "loss") return "Loss";
    if (status === "break-even") return "Break-even";
    return "Calculated";
  }

  function setStatus(card, status) {
    const pill = $('[data-result="status"]', card);
    pill.textContent = profitabilityLabel(status);
    pill.dataset.status = status;
  }

  function readInputs(card) {
    const kind = card.dataset.calculator;
    if (kind === "pay") {
      const input = {
        maxGrossBillRate: getNumber(card, "maxBill"),
        clientDiscountPct: getNumber(card, "payDiscount", 0),
        vmsFeePct: getNumber(card, "payVms", 0),
        overheadPct: getNumber(card, "payOverhead", engine.RULES.defaultOverheadPct),
        strategy: getStrategy(card)
      };
      if (input.strategy === "markup") input.markupPct = getNumber(card, "markupPct");
      else input.desiredProfit = getNumber(card, "desiredProfit");
      return input;
    }
    if (kind === "bill") {
      const input = {
        payRate: getNumber(card, "candidatePay"),
        clientDiscountPct: getNumber(card, "billDiscount", 0),
        vmsFeePct: getNumber(card, "billVms", 0),
        overheadPct: getNumber(card, "billOverhead", engine.RULES.defaultOverheadPct),
        strategy: getStrategy(card)
      };
      if (input.strategy === "markup") input.markupPct = getNumber(card, "markupPct");
      else input.desiredProfit = getNumber(card, "desiredProfit");
      return input;
    }
    return {
      payRate: getNumber(card, "marginPay"),
      grossBillRate: getNumber(card, "marginBill"),
      clientDiscountPct: getNumber(card, "marginDiscount", 0),
      vmsFeePct: getNumber(card, "marginVms", 0),
      overheadPct: getNumber(card, "marginOverhead", engine.RULES.defaultOverheadPct)
    };
  }

  function calculate(card) {
    setError(card);
    const input = readInputs(card);
    let result;
    try {
      if (card.dataset.calculator === "pay") result = engine.calculateMaximumPay(input);
      else if (card.dataset.calculator === "bill") result = engine.calculateBillRate(input);
      else result = engine.calculateMargin(input);
    } catch (error) {
      const message = error instanceof engine.PricingValidationError
        ? error.message
        : "An unexpected calculation error occurred. Check the inputs and try again.";
      setError(card, message);
      setResult(card, "primary", "—");
      setResult(card, "caption", "Correct the highlighted inputs to continue.");
      setResult(card, "status", "Needs attention");
      setResult(card, "netRevenue", "—");
      setResult(card, "grossProfit", "—");
      setResult(card, "margin", "—");
      setResult(card, "markup", "—");
      $('[data-result="breakdown"]', card).replaceChildren();
      $('[data-action="copy"]', card).disabled = true;
      cardStates.delete(card);
      return null;
    }

    const analysis = result.analysisAtPracticalPay || result.analysisAtPracticalBill || result;
    const b = analysis.breakdown;
    const m = analysis.metrics;
    const kind = card.dataset.calculator;

    let primary;
    let caption;
    if (kind === "pay") {
      primary = currency(result.practicalPayRate);
      caption = `Practical maximum pay · theoretical maximum ${currency(result.theoreticalPayRate)}`;
    } else if (kind === "bill") {
      primary = currency(result.practicalGrossBillRate);
      caption = `Practical gross bill rate · theoretical rate ${currency(result.theoreticalGrossBillRate)}`;
    } else {
      primary = percent(m.grossMarginPct);
      caption = `${currency(b.grossProfit)} gross profit per hour`;
    }

    setResult(card, "primary", primary);
    setResult(card, "caption", caption);
    setResult(card, "netRevenue", currency(b.netRevenue));
    setResult(card, "grossProfit", currency(b.grossProfit));
    setResult(card, "margin", percent(m.grossMarginPct));
    setResult(card, "markup", percent(m.markupPct));
    setStatus(card, m.profitability);

    const rows = [
      ["Gross bill rate", currency(b.grossBillRate)],
      ["Client discount", `−${currency(b.clientDiscountAmount)}`],
      ["Discounted bill rate", currency(b.discountedBillRate)],
      ["MSP/VMS deduction", `−${currency(b.vmsFeeAmount)}`],
      ["Net revenue", currency(b.netRevenue)],
      ["Candidate pay", currency(b.candidatePayRate)],
      ["Overhead amount", currency(b.overheadAmount)],
      ["Loaded candidate cost", currency(b.loadedPayCost)],
      ["Gross profit", currency(b.grossProfit)],
      ["Net revenue margin", percent(m.grossMarginPct)],
      ["Markup on loaded cost", percent(m.markupPct)]
    ];
    if (kind === "pay") rows.unshift(["Theoretical maximum pay", currency(result.theoreticalPayRate)]);
    if (kind === "bill") rows.unshift(["Theoretical gross bill rate", currency(result.theoreticalGrossBillRate)]);
    renderBreakdown(card, rows);

    const copyButton = $('[data-action="copy"]', card);
    copyButton.disabled = false;
    setResult(card, "state", "Live preview");
    cardStates.set(card, { result, input, kind, analysis });
    return result;
  }

  function copyResults(card) {
    const state = cardStates.get(card);
    if (!state) return;
    const { analysis, result, kind } = state;
    const b = analysis.breakdown;
    const lines = [
      `KRUTr Calculator Pro — ${kind === "pay" ? "Maximum Pay Rate" : kind === "bill" ? "Bill Rate" : "Margin Analysis"}`,
      `Gross bill rate: ${currency(b.grossBillRate)}`,
      `Discounted bill rate: ${currency(b.discountedBillRate)}`,
      `MSP/VMS deduction: ${currency(b.vmsFeeAmount)}`,
      `Net revenue: ${currency(b.netRevenue)}`,
      `Candidate pay: ${currency(b.candidatePayRate)}`,
      `Loaded candidate cost: ${currency(b.loadedPayCost)}`,
      `Gross profit: ${currency(b.grossProfit)}`,
      `Net revenue margin: ${percent(analysis.metrics.grossMarginPct)}`,
      `Markup: ${percent(analysis.metrics.markupPct)}`
    ];
    if (kind === "pay") lines.splice(1, 0, `Maximum candidate pay: ${currency(result.practicalPayRate)}`);
    if (kind === "bill") lines.splice(1, 0, `Required gross bill rate: ${currency(result.practicalGrossBillRate)}`);
    if (kind === "margin") lines.splice(1, 0, `Net revenue margin: ${percent(analysis.metrics.grossMarginPct)}`);
    const text = lines.join("\n");
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        setResult(card, "state", "Copied to clipboard");
      }).catch(() => fallbackCopy(text, card));
    } else {
      fallbackCopy(text, card);
    }
  }

  function fallbackCopy(text, card) {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.append(area);
    area.select();
    try {
      const successful = document.execCommand("copy");
      setResult(card, "state", successful ? "Copied to clipboard" : "Copy unavailable");
    } catch {
      setResult(card, "state", "Copy unavailable");
    } finally {
      area.remove();
    }
  }

  function resetCard(card) {
    $$("input", card).forEach((input) => {
      if (input.type === "range") input.value = "25";
      else if (input.dataset.field === "payOverhead" || input.dataset.field === "billOverhead" || input.dataset.field === "marginOverhead") input.value = "25";
      else if (input.dataset.field === "markupPct") input.value = "20";
      else if (input.dataset.field === "desiredProfit") input.value = "25";
      else if (input.type === "number" && input.dataset.field?.toLowerCase().includes("discount")) input.value = "0";
      else if (input.type === "number" && input.dataset.field?.toLowerCase().includes("vms")) input.value = "0";
      else input.value = "";
    });
    const markupButton = $('.strategy-option[data-strategy="markup"]', card);
    if (markupButton) {
      $$(".strategy-option", card).forEach((button) => {
        const active = button === markupButton;
        button.classList.toggle("active", active);
        button.setAttribute("aria-pressed", String(active));
      });
      updateStrategyVisibility(card);
    }
    setError(card);
    setResult(card, "primary", "—");
    setResult(card, "caption", "Enter your pricing details to preview results.");
    ["netRevenue", "grossProfit", "margin", "markup"].forEach((key) => setResult(card, key, "—"));
    setResult(card, "status", "Awaiting inputs");
    setResult(card, "state", "Live preview");
    $('[data-result="breakdown"]', card).replaceChildren();
    $('[data-action="copy"]', card).disabled = true;
    cardStates.delete(card);
  }

  function updateStrategyVisibility(card) {
    const strategy = getStrategy(card);
    $$("[data-strategy-input]", card).forEach((group) => {
      group.hidden = group.dataset.strategyInput !== strategy;
    });
  }

  function syncProfitSlider(card, source) {
    const numberInput = $('[data-field="desiredProfit"]', card);
    const slider = $('[data-field="desiredProfitSlider"]', card);
    if (!numberInput || !slider) return;
    if (source === slider) numberInput.value = slider.value;
    else if (numberInput.value !== "") {
      const numeric = Math.min(500, Math.max(0, Number(numberInput.value)));
      slider.value = String(numeric);
    }
  }

  function initializeCard(card) {
    $$(".strategy-option", card).forEach((button) => {
      button.addEventListener("click", () => {
        $$(".strategy-option", card).forEach((option) => {
          const active = option === button;
          option.classList.toggle("active", active);
          option.setAttribute("aria-pressed", String(active));
        });
        updateStrategyVisibility(card);
        calculate(card);
      });
    });

    $$('input[type="number"], input[type="range"]', card).forEach((input) => {
      input.addEventListener("input", () => {
        if (input.dataset.field === "desiredProfit" || input.dataset.field === "desiredProfitSlider") {
          syncProfitSlider(card, input);
        }
        calculate(card);
      });
      input.addEventListener("change", () => calculate(card));
    });

    $('[data-action="calculate"]', card).addEventListener("click", () => {
      const result = calculate(card);
      if (result) {
        setResult(card, "state", "Calculated · saving to history…");
        card.classList.add("just-calculated");
        window.setTimeout(() => card.classList.remove("just-calculated"), 650);
      }
    });
    $('[data-action="reset"]', card).addEventListener("click", () => resetCard(card));
    $('[data-action="copy"]', card).addEventListener("click", () => copyResults(card));
    updateStrategyVisibility(card);
  }

  // Theme preference is intentionally UI-only until persistent settings are added.
  const themeToggle = $("#themeToggle");
  const themeIcon = $("#themeIcon");
  const applyTheme = (theme) => {
    document.documentElement.dataset.theme = theme;
    const light = theme === "light";
    themeIcon.textContent = light ? "☾" : "☼";
    themeToggle.setAttribute("aria-label", light ? "Switch to dark theme" : "Switch to light theme");
  };
  themeToggle?.addEventListener("click", () => {
    const current = document.documentElement.dataset.theme || "dark";
    applyTheme(current === "dark" ? "light" : "dark");
  });

  $$(".calculator-card").forEach(initializeCard);
})();
