/* KRUTr Calculator Pro — Stage 4 presets and durable calculation history. */
"use strict";
(() => {
  const storage = window.KRUTrStorage;
  const engine = window.KRUTrPricingEngine;
  if (!storage || !engine) return;
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];
  const cards = $$(".calculator-card");
  const currency = n => engine.formatCurrency(n, "USD");
  const pct = n => engine.formatPercent(n);
  const id = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);
  const escapeCsv = value => `"${String(value ?? "").replace(/"/g, '""')}"`;
  let showAllHistory = false;
  let editingPresetId = null;
  let skipNextHistorySave = false;

  function notice(message) {
    const node = $("#appNotice"); node.textContent = message; node.classList.add("visible");
    window.clearTimeout(notice.timer); notice.timer = window.setTimeout(() => node.classList.remove("visible"), 3000);
  }
  function element(tag, cls, text) {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function strategyOf(card) {
    return $('.strategy-option[aria-pressed="true"]', card)?.dataset.strategy || "markup";
  }
  function field(card, name) { return $(`[data-field="${name}"]`, card); }
  function val(card, name, fallback = 0) {
    const input = field(card, name);
    return input && input.value.trim() !== "" ? Number(input.value) : fallback;
  }
  function readCard(card) {
    const kind = card.dataset.calculator;
    if (kind === "pay") {
      const x = { maxGrossBillRate: val(card,"maxBill",NaN), clientDiscountPct:val(card,"payDiscount"), vmsFeePct:val(card,"payVms"), overheadPct:val(card,"payOverhead",25), strategy:strategyOf(card) };
      if (x.strategy === "markup") x.markupPct=val(card,"markupPct",NaN); else x.desiredProfit=val(card,"desiredProfit",NaN);
      return x;
    }
    if (kind === "bill") {
      const x = { payRate:val(card,"candidatePay",NaN), clientDiscountPct:val(card,"billDiscount"), vmsFeePct:val(card,"billVms"), overheadPct:val(card,"billOverhead",25), strategy:strategyOf(card) };
      if (x.strategy === "markup") x.markupPct=val(card,"markupPct",NaN); else x.desiredProfit=val(card,"desiredProfit",NaN);
      return x;
    }
    return { payRate:val(card,"marginPay",NaN), grossBillRate:val(card,"marginBill",NaN), clientDiscountPct:val(card,"marginDiscount"), vmsFeePct:val(card,"marginVms"), overheadPct:val(card,"marginOverhead",25) };
  }
  function compute(kind, input) {
    return kind === "pay" ? engine.calculateMaximumPay(input) : kind === "bill" ? engine.calculateBillRate(input) : engine.calculateMargin(input);
  }
  function outputFor(kind, result) {
    const a = result.analysisAtPracticalPay || result.analysisAtPracticalBill || result;
    const b = a.breakdown, m = a.metrics;
    return {
      primary: kind === "pay" ? result.practicalPayRate : kind === "bill" ? result.practicalGrossBillRate : m.grossMarginPct,
      primaryLabel: kind === "pay" ? "Maximum pay rate" : kind === "bill" ? "Required gross bill rate" : "Net revenue margin",
      netRevenue: b.netRevenue, grossProfit: b.grossProfit, margin: m.grossMarginPct, markup: m.markupPct,
      grossBillRate: b.grossBillRate, candidatePayRate: b.candidatePayRate,
      profitability: m.profitability
    };
  }
  async function saveCalculation(card) {
    try {
      const kind = card.dataset.calculator, input = readCard(card), result = compute(kind, input);
      const record = { id:id(), createdAt:new Date().toISOString(), kind, input, output:outputFor(kind,result) };
      await storage.put("calculations", record);
      const stateNode=$('[data-result="state"]',card);
      if(stateNode) stateNode.textContent="Saved to history";
      await renderHistory(); notice("Calculation saved to history.");
    } catch (error) {
      notice(error.message || "Could not save this calculation.");
    }
  }

  function applyPresetToCard(preset, card) {
    const kind=card.dataset.calculator;
    const mapping = kind === "pay"
      ? {payDiscount:preset.clientDiscountPct,payVms:preset.vmsFeePct,payOverhead:preset.overheadPct}
      : kind === "bill"
      ? {billDiscount:preset.clientDiscountPct,billVms:preset.vmsFeePct,billOverhead:preset.overheadPct}
      : {marginDiscount:preset.clientDiscountPct,marginVms:preset.vmsFeePct,marginOverhead:preset.overheadPct};
    Object.entries(mapping).forEach(([name,value]) => {
      const input=field(card,name);
      if(input) { input.value=String(value); input.dispatchEvent(new Event("input",{bubbles:true})); }
    });
    if (kind !== "margin") {
      const strategyButton=$(`.strategy-option[data-strategy="${preset.strategy}"]`,card);
      if(strategyButton) strategyButton.click();
      const markup=field(card,"markupPct"), profit=field(card,"desiredProfit");
      if(markup) { markup.value=String(preset.markupPct); markup.dispatchEvent(new Event("input",{bubbles:true})); }
      if(profit) {
        profit.value=String(preset.desiredProfit);
        const slider=field(card,"desiredProfitSlider"); if(slider) slider.value=String(preset.desiredProfit);
        profit.dispatchEvent(new Event("input",{bubbles:true}));
      }
    }
  }
  function validPreset(p) {
    return p && typeof p.name==="string" && p.name.trim().length>0 && p.name.length<=80 &&
      ["markup","desiredProfit"].includes(p.strategy) &&
      ["clientDiscountPct","vmsFeePct","overheadPct","markupPct","desiredProfit"].every(k=>Number.isFinite(Number(p[k]))) &&
      Number(p.clientDiscountPct)>=0 && Number(p.clientDiscountPct)<=100 &&
      Number(p.vmsFeePct)>=0 && Number(p.vmsFeePct)<=100 &&
      Number(p.overheadPct)>=0 && Number(p.markupPct)>=0 &&
      Number(p.desiredProfit)>=0 && Number(p.desiredProfit)<=500;
  }
  function presetFromForm() {
    return { id:editingPresetId || id(), name:$("#presetName").value.trim(),
      clientDiscountPct:Number($("#presetDiscount").value), vmsFeePct:Number($("#presetVms").value),
      overheadPct:Number($("#presetOverhead").value), strategy:$("#presetStrategy").value,
      markupPct:Number($("#presetMarkup").value), desiredProfit:Number($("#presetProfit").value),
      updatedAt:new Date().toISOString(), createdAt:new Date().toISOString() };
  }
  function openPreset(preset=null) {
    editingPresetId=preset?.id || null;
    $("#presetDialogTitle").textContent=preset ? "Edit preset" : "Create preset";
    $("#presetName").value=preset?.name || "";
    $("#presetDiscount").value=preset?.clientDiscountPct ?? 0;
    $("#presetVms").value=preset?.vmsFeePct ?? 0;
    $("#presetOverhead").value=preset?.overheadPct ?? 25;
    $("#presetStrategy").value=preset?.strategy || "markup";
    $("#presetMarkup").value=preset?.markupPct ?? 20;
    $("#presetProfit").value=preset?.desiredProfit ?? 25;
    $("#presetFormError").hidden=true;
    $("#presetDialog").showModal();
    $("#presetName").focus();
  }
  async function renderPresets() {
    const list=$("#presetList"), presets=(await storage.all("presets")).sort((a,b)=>a.name.localeCompare(b.name));
    list.replaceChildren();
    if(!presets.length) { list.append(element("div","empty-state","")); const e=list.firstChild; e.append(element("strong","","No presets yet"),element("small","","Create a preset to reuse client pricing settings.")); return; }
    presets.forEach(p => {
      const row=element("div","record-row"), info=element("div","record-info");
      info.append(element("strong","",p.name),element("small","",`${p.clientDiscountPct}% discount · ${p.vmsFeePct}% VMS · ${p.overheadPct}% overhead · ${p.strategy==="markup" ? `${p.markupPct}% markup` : `${currency(p.desiredProfit)}/hr profit`}`));
      const actions=element("div","record-actions");
      const apply=element("button","mini-button","Apply"); apply.type="button"; apply.addEventListener("click",()=>{
        const target=window.prompt(`Apply "${p.name}" to: type pay, bill, margin or all`, "all");
        if(!target) return;
        const selected=target.toLowerCase().trim();
        if(selected==="all") cards.forEach(c=>applyPresetToCard(p,c));
        else { const card=cards.find(c=>c.dataset.calculator===selected); if(!card) {notice("Choose pay, bill, margin or all.");return;} applyPresetToCard(p,card); }
        notice(`Preset "${p.name}" applied.`);
      });
      const edit=element("button","mini-button","Edit"); edit.type="button"; edit.addEventListener("click",()=>openPreset(p));
      const del=element("button","mini-button danger","Delete"); del.type="button"; del.addEventListener("click",async()=>{if(window.confirm(`Delete preset "${p.name}"?`)){await storage.remove("presets",p.id);renderPresets();notice("Preset deleted.");}});
      actions.append(apply,edit,del); row.append(info,actions); list.append(row);
    });
  }
  async function renderHistory() {
    const list=$("#historyList"), records=(await storage.all("calculations")).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
    list.replaceChildren();
    if(!records.length) { const e=element("div","empty-state"); e.append(element("strong","","No calculations saved"),element("small","","Completed calculations will appear here.")); list.append(e); return; }
    const visible=showAllHistory?records:records.slice(0,5);
    visible.forEach(r=>{
      const row=element("div","record-row"), info=element("div","record-info");
      const label=r.kind==="pay"?"Maximum Pay":r.kind==="bill"?"Bill Rate":"Margin Analysis";
      const primary=r.kind==="margin"?pct(r.output.primary):currency(r.output.primary);
      info.append(element("strong","",`${label} · ${primary}`),element("small","",`${new Date(r.createdAt).toLocaleString()} · ${r.output.profitability || "Calculated"}`));
      const actions=element("div","record-actions");
      const reopen=element("button","mini-button","Reopen"); reopen.type="button"; reopen.addEventListener("click",()=>reopenCalculation(r));
      const copy=element("button","mini-button","Copy"); copy.type="button"; copy.addEventListener("click",()=>copyRecord(r));
      const del=element("button","mini-button danger","Delete"); del.type="button"; del.addEventListener("click",async()=>{await storage.remove("calculations",r.id);renderHistory();notice("History item deleted.");});
      actions.append(reopen,copy,del);row.append(info,actions);list.append(row);
    });
    if(records.length>5) $("#viewHistory").textContent=showAllHistory?"Show recent":"Show all";
    else $("#viewHistory").textContent="Show all";
  }
  function reopenCalculation(record) {
    const card=cards.find(c=>c.dataset.calculator===record.kind); if(!card)return;
    const x=record.input;
    const mapping=record.kind==="pay"
      ? {maxBill:x.maxGrossBillRate,payDiscount:x.clientDiscountPct,payVms:x.vmsFeePct,payOverhead:x.overheadPct,markupPct:x.markupPct,desiredProfit:x.desiredProfit}
      : record.kind==="bill"
      ? {candidatePay:x.payRate,billDiscount:x.clientDiscountPct,billVms:x.vmsFeePct,billOverhead:x.overheadPct,markupPct:x.markupPct,desiredProfit:x.desiredProfit}
      : {marginPay:x.payRate,marginBill:x.grossBillRate,marginDiscount:x.clientDiscountPct,marginVms:x.vmsFeePct,marginOverhead:x.overheadPct};
    Object.entries(mapping).forEach(([name,value])=>{const input=field(card,name);if(input&&value!==undefined)input.value=String(value);});
    if(record.kind!=="margin") {
      const button=$(`.strategy-option[data-strategy="${x.strategy}"]`,card);if(button)button.click();
      const slider=field(card,"desiredProfitSlider");if(slider&&x.desiredProfit!==undefined)slider.value=String(x.desiredProfit);
    }
    skipNextHistorySave = true;
    $('[data-action="calculate"]',card).click();
    card.scrollIntoView({behavior:"smooth",block:"center"});
  }
  function copyRecord(r) {
    const text=[`KRUTr Calculator Pro — ${r.kind}`,`Primary result: ${r.output.primary}`,`Gross bill rate: ${r.output.grossBillRate}`,`Candidate pay: ${r.output.candidatePayRate}`,`Net revenue: ${r.output.netRevenue}`,`Gross profit: ${r.output.grossProfit}`,`Margin: ${r.output.margin}%`,`Markup: ${r.output.markup}%`].join("\n");
    if(navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(()=>notice("Calculation copied.")).catch(()=>notice("Clipboard unavailable."));
    else notice("Clipboard unavailable in this browser context.");
  }
  function download(name,type,content) {
    const blob=new Blob([content],{type}), url=URL.createObjectURL(blob), a=element("a");
    a.href=url;a.download=name;document.body.append(a);a.click();a.remove();URL.revokeObjectURL(url);
  }

  $("#createPreset").addEventListener("click",()=>openPreset());
  $("#closePresetDialog").addEventListener("click",()=>$("#presetDialog").close());
  $("#cancelPreset").addEventListener("click",()=>$("#presetDialog").close());
  $("#presetForm").addEventListener("submit",async e=>{
    e.preventDefault();const p=presetFromForm();
    if(!validPreset(p)){const err=$("#presetFormError");err.textContent="Enter a name and valid numeric values. Discount/VMS must be 0–100%; desired profit must be $0–$500.";err.hidden=false;return;}
    const existing=(await storage.all("presets")).find(x=>x.name.toLowerCase()===p.name.toLowerCase()&&x.id!==p.id);
    if(existing&&!window.confirm(`A preset named "${p.name}" already exists. Save this as a separate preset?`))return;
    if(editingPresetId) {
      const prior=(await storage.all("presets")).find(x=>x.id===editingPresetId);
      if(prior) p.createdAt=prior.createdAt;
    } else p.createdAt=new Date().toISOString();
    await storage.put("presets",p);$("#presetDialog").close();await renderPresets();notice("Preset saved.");
  });
  $("#importPresets").addEventListener("click",()=>$("#presetFile").click());
  $("#presetFile").addEventListener("change",async e=>{
    const file=e.target.files[0];if(!file)return;
    try {
      const parsed=JSON.parse(await file.text()), items=Array.isArray(parsed)?parsed:parsed.presets;
      if(!Array.isArray(items))throw new Error("This file does not contain a preset list.");
      const valid=items.filter(validPreset);
      if(!valid.length)throw new Error("No valid presets were found in the file.");
      let count=0;
      for(const raw of valid){const preset={...raw,id:id(),createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};await storage.put("presets",preset);count++;}
      await renderPresets();notice(`${count} preset(s) imported.`);
    } catch(err){notice(err.message||"Could not import this JSON file.");}
    finally{e.target.value="";}
  });
  $("#exportPresets").addEventListener("click",async()=>{
    const presets=await storage.all("presets");
    download("krutr-client-presets.json","application/json",JSON.stringify({format:"KRUTr-Calculator-Pro-Presets",version:1,exportedAt:new Date().toISOString(),presets},null,2));
    notice(`${presets.length} preset(s) exported.`);
  });
  $("#viewHistory").addEventListener("click",()=>{showAllHistory=!showAllHistory;renderHistory();});
  $("#clearHistory").addEventListener("click",async()=>{if(window.confirm("Permanently clear all saved calculations?")){await storage.clear("calculations");showAllHistory=false;renderHistory();notice("Calculation history cleared.");}});
  $("#exportHistory").addEventListener("click",async()=>{
    const records=(await storage.all("calculations")).sort((a,b)=>a.createdAt.localeCompare(b.createdAt));
    const columns=["createdAt","kind","primary","grossBillRate","candidatePayRate","netRevenue","grossProfit","margin","markup","clientDiscountPct","vmsFeePct","overheadPct"];
    const rows=[columns.map(escapeCsv).join(",")];
    records.forEach(r=>rows.push([r.createdAt,r.kind,r.output.primary,r.output.grossBillRate,r.output.candidatePayRate,r.output.netRevenue,r.output.grossProfit,r.output.margin,r.output.markup,r.input.clientDiscountPct,r.input.vmsFeePct,r.input.overheadPct].map(escapeCsv).join(",")));
    download("krutr-calculation-history.csv","text/csv;charset=utf-8","\uFEFF"+rows.join("\r\n"));
    notice(`${records.length} calculation(s) exported.`);
  });
  // The Stage 3 Calculate listener runs first on the button; this listener then persists its validated inputs/result.
  cards.forEach(card=>$('[data-action="calculate"]',card).addEventListener("click",()=>{
    if(skipNextHistorySave) { skipNextHistorySave=false; return; }
    saveCalculation(card);
  }));
  Promise.all([renderPresets(),renderHistory()]).then(()=>notice(`Workspace storage: ${storage.mode}.`)).catch(()=>notice("Storage could not be initialized."));
})();