import "./style.css";
import { recompute, valuate } from "./api";
import { apiBaseUrl, loadConfig, resetConfigCache, type AppConfig } from "./config";
import type {
  ContextMode,
  DealerBrief,
  FirearmQuery,
  MarketListing,
  PriceStats,
  SellScenario,
  ValuationResult,
} from "./types";
import { initInventoryUi, type InventoryUiElements } from "./inventory-ui";
import {
  formatMoney,
  formatStats,
  listingsByType,
  renderTrendBars,
  searchPreview,
} from "./valuation-ui";

const DEAL_DEFAULTS_KEY = "mmd_deal_defaults";

interface DealDefaults {
  target_profit: number;
  min_margin_pct: number;
  transfer_fee: number;
  inbound_ship: number;
  buyer_premium_pct: number;
  listing_addons: number;
}

let appConfig: AppConfig | null = null;
let lastResult: ValuationResult | null = null;
let recomputeTimer: number | null = null;
let recomputeInFlight = false;

const els = {
  category: document.getElementById("category") as HTMLSelectElement,
  manufacturer: document.getElementById("manufacturer") as HTMLInputElement,
  model: document.getElementById("model") as HTMLInputElement,
  variant: document.getElementById("variant") as HTMLInputElement,
  caliber: document.getElementById("caliber") as HTMLInputElement,
  condition: document.getElementById("condition") as HTMLSelectElement,
  upc: document.getElementById("upc") as HTMLInputElement,
  mpn: document.getElementById("mpn") as HTMLInputElement,
  myCost: document.getElementById("my-cost") as HTMLInputElement,
  streetRetail: document.getElementById("street-retail") as HTMLInputElement,
  streetRetailField: document.getElementById("street-retail-field") as HTMLLabelElement,
  referenceMsrp: document.getElementById("reference-msrp") as HTMLInputElement,
  msrpField: document.getElementById("msrp-field") as HTMLLabelElement,
  buyerPremiumPct: document.getElementById("buyer-premium-pct") as HTMLInputElement,
  listingAddons: document.getElementById("listing-addons") as HTMLInputElement,
  targetProfit: document.getElementById("target-profit") as HTMLInputElement,
  minMarginPct: document.getElementById("min-margin-pct") as HTMLInputElement,
  transferFee: document.getElementById("transfer-fee") as HTMLInputElement,
  inboundShip: document.getElementById("inbound-ship") as HTMLInputElement,
  sellAssumption: document.getElementById("sell-assumption") as HTMLSelectElement,
  auctionFees: document.getElementById("auction-fees") as HTMLDivElement,
  sampleOnly: document.getElementById("sample-only") as HTMLInputElement,
  forceRefresh: document.getElementById("force-refresh") as HTMLInputElement,
  preview: document.getElementById("preview") as HTMLParagraphElement,
  valuateBtn: document.getElementById("valuate-btn") as HTMLButtonElement,
  status: document.getElementById("status") as HTMLParagraphElement,
  emptyState: document.getElementById("empty-state") as HTMLDivElement,
  loadingState: document.getElementById("loading-state") as HTMLDivElement,
  loadingDetail: document.getElementById("loading-detail") as HTMLParagraphElement,
  errorState: document.getElementById("error-state") as HTMLDivElement,
  errorDetail: document.getElementById("error-detail") as HTMLParagraphElement,
  results: document.getElementById("results") as HTMLDivElement,
  soldSummaryLabel: document.getElementById("sold-summary-label") as HTMLHeadingElement,
  soldSummary: document.getElementById("sold-summary") as HTMLParagraphElement,
  askingSummary: document.getElementById("asking-summary") as HTMLParagraphElement,
  wholesaleSummary: document.getElementById("wholesale-summary") as HTMLParagraphElement,
  verdictBadge: document.getElementById("verdict-badge") as HTMLParagraphElement,
  insightHeadline: document.getElementById("insight-headline") as HTMLParagraphElement,
  insightBlocks: document.getElementById("insight-blocks") as HTMLDivElement,
  insightDetail: document.getElementById("insight-detail") as HTMLParagraphElement,
  dealerDesk: document.getElementById("dealer-desk") as HTMLDivElement,
  confidenceBadge: document.getElementById("confidence-badge") as HTMLSpanElement,
  dealerMarketLine: document.getElementById("dealer-market-line") as HTMLParagraphElement,
  dealerRedFlags: document.getElementById("dealer-red-flags") as HTMLUListElement,
  allInTable: document.querySelector("#all-in-table tbody") as HTMLTableSectionElement,
  ceilingsTable: document.querySelector("#ceilings-table tbody") as HTMLTableSectionElement,
  gbNetBody: document.getElementById("gb-net-body") as HTMLTableSectionElement,
  profitBody: document.getElementById("profit-body") as HTMLTableSectionElement,
  profitTableTitle: document.getElementById("profit-table-title") as HTMLHeadingElement,
  statsBody: document.getElementById("stats-body") as HTMLTableSectionElement,
  trends: document.getElementById("trends") as HTMLDivElement,
  sourceStatus: document.getElementById("source-status") as HTMLParagraphElement,
  soldBody: document.getElementById("sold-body") as HTMLTableSectionElement,
  askingBody: document.getElementById("asking-body") as HTMLTableSectionElement,
  wholesaleBody: document.getElementById("wholesale-body") as HTMLTableSectionElement,
  allBody: document.getElementById("all-body") as HTMLTableSectionElement,
  meta: document.getElementById("meta") as HTMLParagraphElement,
  linkCompany: document.getElementById("link-company") as HTMLAnchorElement,
  linkLedger: document.getElementById("link-ledger") as HTMLAnchorElement,
  apiEndpoint: document.getElementById("api-endpoint") as HTMLParagraphElement,
  csvSource: document.getElementById("csv-source") as HTMLInputElement,
  csvPreset: document.getElementById("csv-preset") as HTMLSelectElement,
  csvReplace: document.getElementById("csv-replace") as HTMLInputElement,
  csvFile: document.getElementById("csv-file") as HTMLInputElement,
  csvFileLabel: document.getElementById("csv-file-label") as HTMLElement,
  csvImportBtn: document.getElementById("csv-import-btn") as HTMLButtonElement,
  csvCatalogList: document.getElementById("csv-catalog-list") as HTMLUListElement,
};

const inventoryEls: InventoryUiElements = {
  source: els.csvSource,
  preset: els.csvPreset,
  replace: els.csvReplace,
  file: els.csvFile,
  fileLabel: els.csvFileLabel,
  importBtn: els.csvImportBtn,
  catalogList: els.csvCatalogList,
  status: (msg, kind) => setStatus(msg, kind),
};

function getContext(): ContextMode {
  const checked = document.querySelector('input[name="context"]:checked') as HTMLInputElement;
  return (checked?.value as ContextMode) || "margin_spotter";
}

const DEALER_HINTS: Record<ContextMode, string> = {
  margin_spotter:
    "Margin spotter: enter your cost. Valuate loads market once; deal fields recalc instantly.",
  vendor_deal:
    "Vendor deal: cost + their sale price. Market from Outdoor Analytics; profit recalcs locally.",
  auction_sniper:
    "Auction sniper: max hammer from sold comps. Change premium/add-ons without re-searching.",
};

function loadDealDefaults(): void {
  try {
    const raw = localStorage.getItem(DEAL_DEFAULTS_KEY);
    if (!raw) return;
    const d = JSON.parse(raw) as Partial<DealDefaults>;
    if (d.target_profit != null) els.targetProfit.value = String(d.target_profit);
    if (d.min_margin_pct != null) els.minMarginPct.value = String(d.min_margin_pct);
    if (d.transfer_fee != null) els.transferFee.value = String(d.transfer_fee);
    if (d.inbound_ship != null) els.inboundShip.value = String(d.inbound_ship);
    if (d.buyer_premium_pct != null) els.buyerPremiumPct.value = String(d.buyer_premium_pct);
    if (d.listing_addons != null) els.listingAddons.value = String(d.listing_addons);
  } catch {
    /* ignore */
  }
}

function saveDealDefaults(): void {
  const d: DealDefaults = {
    target_profit: Number(els.targetProfit.value) || 75,
    min_margin_pct: Number(els.minMarginPct.value) || 15,
    transfer_fee: Number(els.transferFee.value) || 0,
    inbound_ship: Number(els.inboundShip.value) || 0,
    buyer_premium_pct: Number(els.buyerPremiumPct.value) || 18,
    listing_addons: Number(els.listingAddons.value) || 10,
  };
  localStorage.setItem(DEAL_DEFAULTS_KEY, JSON.stringify(d));
}

function syncContextPanels(): void {
  const ctx = getContext();
  els.auctionFees.classList.toggle("hidden", ctx !== "auction_sniper");
  els.streetRetailField.classList.toggle("hidden", ctx !== "vendor_deal");
  els.msrpField.classList.toggle("hidden", ctx !== "vendor_deal");
  const hint = document.getElementById("dealer-hint");
  if (hint) hint.textContent = DEALER_HINTS[ctx];
}

function parseOptionalNumber(raw: string): number | null {
  const t = raw.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function getBuyerPremiumPct(): number | null {
  if (getContext() !== "auction_sniper") return null;
  return parseOptionalNumber(els.buyerPremiumPct.value);
}

function getListingAddons(): number {
  const n = parseOptionalNumber(els.listingAddons.value);
  return n != null ? n : 10;
}

function getSellAssumption(): SellScenario | null {
  const v = els.sellAssumption.value;
  if (v === "p25" || v === "median" || v === "p75") return v;
  return null;
}

function getQuery(): FirearmQuery {
  return {
    category: els.category.value,
    manufacturer: els.manufacturer.value.trim(),
    model: els.model.value.trim(),
    variant: els.variant.value.trim(),
    caliber: els.caliber.value.trim(),
    condition: els.condition.value,
    barrel_length: "",
    upc: els.upc.value.trim(),
    mpn: els.mpn.value.trim(),
    exclude_tokens: [],
  };
}

function getDealPayload() {
  const myCostRaw = els.myCost.value.trim();
  const streetRaw = els.streetRetail.value.trim();
  const msrpRaw = els.referenceMsrp.value.trim();
  return {
    context: getContext(),
    my_cost: myCostRaw ? Number(myCostRaw) : null,
    street_retail: streetRaw ? Number(streetRaw) : null,
    reference_msrp: msrpRaw ? Number(msrpRaw) : null,
    buyer_premium_pct: getBuyerPremiumPct(),
    listing_addons: getListingAddons(),
    target_profit: parseOptionalNumber(els.targetProfit.value) ?? 75,
    min_margin_pct: parseOptionalNumber(els.minMarginPct.value) ?? 15,
    transfer_fee: parseOptionalNumber(els.transferFee.value) ?? 0,
    inbound_ship: parseOptionalNumber(els.inboundShip.value) ?? 0,
    sell_assumption: getSellAssumption(),
  };
}

function updatePreview(): void {
  els.preview.textContent = `Searching: ${searchPreview(getQuery())}`;
}

function isExactSkuListing(l: MarketListing, query: FirearmQuery): boolean {
  const upc = query.upc.trim();
  if (upc) {
    if (l.upc && l.upc.trim() === upc) return true;
    const needle = upc.replace(/\D/g, "");
    const hay = `${l.title} ${l.upc}`.replace(/\D/g, "");
    if (needle.length >= 8 && hay.includes(needle)) return true;
  }
  const mpn = query.mpn.trim().toLowerCase();
  if (mpn && l.title.toLowerCase().includes(mpn)) return true;
  return false;
}

function renderBlock(title: string, lines: string[]): string {
  if (!lines.length) return "";
  const items = lines.map((l) => `<li>${l}</li>`).join("");
  return `<div class="insight-block"><h4>${title}</h4><ul>${items}</ul></div>`;
}

function renderAllListings(
  tbody: HTMLTableSectionElement,
  listings: ValuationResult["listings"]
): void {
  tbody.replaceChildren();
  if (!listings.length) {
    const tr = document.createElement("tr");
    tr.innerHTML = '<td colspan="6" class="muted">No listings</td>';
    tbody.appendChild(tr);
    return;
  }
  for (const l of listings) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${l.title}</td>
      <td>${formatMoney(l.price)}</td>
      <td>${l.price_type}</td>
      <td>${l.source}</td>
      <td>${l.match_score.toFixed(0)}</td>
      <td>${l.included_in_stats ? "Yes" : "No"}</td>
    `;
    tbody.appendChild(tr);
  }
}

function renderListingRows(
  tbody: HTMLTableSectionElement,
  listings: ValuationResult["listings"],
  opts: { showLink?: boolean; showTier?: boolean; query?: FirearmQuery } = {}
): void {
  tbody.replaceChildren();
  if (!listings.length) {
    const tr = document.createElement("tr");
    tr.innerHTML = '<td colspan="6" class="muted">No matching listings</td>';
    tbody.appendChild(tr);
    return;
  }
  for (const l of listings) {
    const tr = document.createElement("tr");
    const link = l.url
      ? `<a href="${l.url}" target="_blank" rel="noopener">View</a>`
      : "—";
    const tier =
      opts.showTier && opts.query
        ? isExactSkuListing(l, opts.query)
          ? '<span class="tier-badge tier-a">SKU</span>'
          : '<span class="tier-badge tier-b">Match</span>'
        : `${l.match_score.toFixed(0)}`;
    tr.innerHTML = `
      <td>${l.title}</td>
      <td>${formatMoney(l.price)}</td>
      <td>${l.condition || "—"}</td>
      <td>${l.source}</td>
      <td>${opts.showLink ? link : tier}</td>
    `;
    tbody.appendChild(tr);
  }
}

function renderStatsTable(result: ValuationResult): void {
  const soldLabel =
    (result.insights.assumptions?.sold_label as string) || "Sold (90d)";
  const rows: [string, PriceStats][] = [[soldLabel, result.sold_stats]];
  if (
    result.sold_stats_sku.count > 0 &&
    result.sold_stats_all.count > result.sold_stats_sku.count
  ) {
    rows.push(["All matches (90d)", result.sold_stats_all]);
  } else if (
    result.sold_stats_sku.count > 0 &&
    soldLabel !== "Exact SKU (90d)"
  ) {
    rows.push(["Exact SKU (90d)", result.sold_stats_sku]);
  }
  rows.push(
    ["Asking", result.asking_stats],
    ["Wholesale", result.wholesale_stats]
  );
  els.statsBody.replaceChildren();
  for (const [label, stats] of rows) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${label}</td>
      <td>${stats.count}</td>
      <td>${formatMoney(stats.low)}</td>
      <td>${formatMoney(stats.p25)}</td>
      <td>${formatMoney(stats.median)}</td>
      <td>${formatMoney(stats.p75)}</td>
      <td>${formatMoney(stats.high)}</td>
    `;
    els.statsBody.appendChild(tr);
  }
}

function renderVerdict(brief: DealerBrief | undefined): void {
  if (!brief?.verdict) {
    els.verdictBadge.hidden = true;
    return;
  }
  els.verdictBadge.hidden = false;
  els.verdictBadge.textContent = brief.verdict;
  els.verdictBadge.className = `verdict-badge verdict--${brief.verdict}`;
}

function renderDealerDesk(brief: DealerBrief | undefined): void {
  if (!brief || !brief.market) {
    els.dealerDesk.classList.add("hidden");
    return;
  }
  els.dealerDesk.classList.remove("hidden");
  const m = brief.market;
  els.confidenceBadge.textContent = `${brief.confidence} confidence`;
  els.confidenceBadge.className = `confidence-badge confidence--${brief.confidence}`;

  const trend =
    m.trend === "rising"
      ? "↑ rising"
      : m.trend === "falling"
        ? "↓ falling"
        : m.trend === "stable"
          ? "→ stable"
          : "trend n/a";
  els.dealerMarketLine.textContent = [
    `${m.sold_label}: ${m.sold_count} matched (${m.sold_count_all} all)`,
    `P25 ${formatMoney(m.sold_p25)} · med ${formatMoney(m.sold_median)} · P75 ${formatMoney(m.sold_p75)}`,
    m.asking_count ? `Asking med ${formatMoney(m.asking_median)} (${m.asking_count})` : "",
    trend,
    m.ask_vs_sold_label || "",
  ]
    .filter(Boolean)
    .join(" · ");

  els.dealerRedFlags.replaceChildren();
  for (const flag of brief.red_flags || []) {
    const li = document.createElement("li");
    li.textContent = flag;
    els.dealerRedFlags.appendChild(li);
  }

  const allIn = brief.all_in || {};
  const allInRows: [string, string][] = [];
  if (allIn.invoice_or_hammer != null) {
    allInRows.push([
      allIn.mode === "auction" ? "Max hammer (est.)" : "Invoice / hammer",
      formatMoney(allIn.invoice_or_hammer),
    ]);
  }
  if (allIn.buyer_premium_amt != null && allIn.buyer_premium_amt > 0) {
    allInRows.push([
      `Buyer premium (${allIn.buyer_premium_pct}%)`,
      formatMoney(allIn.buyer_premium_amt),
    ]);
  }
  if (allIn.transfer_fee) allInRows.push(["Transfer in", formatMoney(allIn.transfer_fee)]);
  if (allIn.inbound_ship) allInRows.push(["Inbound ship", formatMoney(allIn.inbound_ship)]);
  if (allIn.all_in_total != null) {
    allInRows.push(["All-in total", formatMoney(allIn.all_in_total)]);
  }
  els.allInTable.replaceChildren();
  for (const [label, val] of allInRows) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${label}</td><td>${val}</td>`;
    els.allInTable.appendChild(tr);
  }

  const c = brief.ceilings || {};
  const ceilRows: [string, string][] = [
    ["Sell assumption", `${c.sell_assumption_label || c.sell_assumption} ${formatMoney(c.sell_price || 0)}`],
    ["Break-even all-in", formatMoney(c.break_even_all_in || 0)],
    ["Max pay all-in", formatMoney(c.max_pay_all_in || 0)],
    ["Conservative max pay (P25 sell)", formatMoney(c.conservative_max_pay_all_in || 0)],
    ["Aggressive max pay (P75 sell)", formatMoney(c.aggressive_max_pay_all_in || 0)],
  ];
  if (c.max_hammer != null && c.max_hammer > 0) {
    ceilRows.splice(3, 0, ["Max hammer", formatMoney(c.max_hammer)]);
  }
  els.ceilingsTable.replaceChildren();
  for (const [label, val] of ceilRows) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${label}</td><td>${val}</td>`;
    els.ceilingsTable.appendChild(tr);
  }

  els.gbNetBody.replaceChildren();
  for (const row of brief.gb_net_table || []) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${row.scenario}</td>
      <td>${formatMoney(row.sell_gross)}</td>
      <td>${formatMoney(row.final_value_fee)}</td>
      <td>${formatMoney(row.master_ffl_fee)}</td>
      <td>${formatMoney(row.listing_addons)}</td>
      <td>${formatMoney(row.net_proceeds)}</td>
    `;
    els.gbNetBody.appendChild(tr);
  }

  const profits = brief.profit_at_cost || [];
  els.profitBody.replaceChildren();
  if (!profits.length) {
    els.profitTableTitle.textContent = "Profit at your cost (enter dealer cost)";
    const tr = document.createElement("tr");
    tr.innerHTML = '<td colspan="5" class="muted">Enter dealer cost to see profit table</td>';
    els.profitBody.appendChild(tr);
  } else {
    els.profitTableTitle.textContent = "Profit at your cost (GunBroker)";
    for (const row of profits) {
      const tr = document.createElement("tr");
      const cls = row.profit >= 0 ? "profit-positive" : "profit-negative";
      tr.innerHTML = `
        <td>${row.scenario}</td>
        <td>${formatMoney(row.sell_gross)}</td>
        <td>${formatMoney(row.gb_net)}</td>
        <td class="${cls}">${formatMoney(row.profit)}</td>
        <td class="${cls}">${row.margin_pct}%</td>
      `;
      els.profitBody.appendChild(tr);
    }
  }
}

function renderInsight(result: ValuationResult): void {
  const ins = result.insights;
  const brief = ins.dealer_brief;
  renderVerdict(brief);
  els.insightHeadline.textContent = ins.headline || "—";

  const acq = ins.assumptions?.acquisition_lines;
  const resale = ins.assumptions?.resale_lines;
  const blocks: string[] = [];
  if (Array.isArray(acq) && acq.length) {
    blocks.push(renderBlock("Your cost vs market", acq as string[]));
  }
  if (Array.isArray(resale) && resale.length) {
    blocks.push(renderBlock("If you sell", resale as string[]));
  }
  els.insightBlocks.innerHTML = blocks.join("");

  renderDealerDesk(brief);

  const ctx = getContext();
  const details: string[] = [];
  if (brief?.verdict_reason) details.push(brief.verdict_reason);
  if (ctx === "auction_sniper") {
    if (ins.max_bid != null) details.push(`Max hammer: ${formatMoney(ins.max_bid)}`);
  } else {
    if (ins.assumptions?.promo_ok === true) details.push("Vendor promo: good");
    if (ins.assumptions?.promo_ok === false) details.push("Vendor promo: weak");
    if (ins.assumptions?.resale_ok === true) details.push("Resale room: OK");
    if (ins.assumptions?.resale_ok === false) details.push("Resale room: thin");
  }
  els.insightDetail.textContent = details.join(" · ");
}

function hideResultPanels(): void {
  els.emptyState.classList.add("hidden");
  els.loadingState.classList.add("hidden");
  els.errorState.classList.add("hidden");
  els.results.classList.add("hidden");
}

function showResultsLoading(detail: string, title = "Fetching Outdoor Analytics…"): void {
  hideResultPanels();
  const titleEl = els.loadingState.querySelector(".loading-title");
  if (titleEl) titleEl.textContent = title;
  els.loadingDetail.textContent = detail;
  els.loadingState.classList.remove("hidden");
}

function showResultsError(message: string): void {
  hideResultPanels();
  els.errorDetail.textContent = message;
  els.errorState.classList.remove("hidden");
}

function renderResult(result: ValuationResult): void {
  lastResult = result;
  hideResultPanels();
  els.results.classList.remove("hidden");

  const soldLabel =
    (result.insights.assumptions?.sold_label as string) || "Sold (90d)";
  els.soldSummaryLabel.textContent = soldLabel;
  els.soldSummary.textContent = formatStats(result.sold_stats);
  els.askingSummary.textContent = formatStats(result.asking_stats);
  els.wholesaleSummary.textContent = formatStats(result.wholesale_stats);

  renderInsight(result);
  renderStatsTable(result);
  els.trends.innerHTML = renderTrendBars(result.trends);

  const statusParts = Object.entries(result.source_status).map(([k, v]) => {
    const ok = v.startsWith("ok");
    return `${k}: ${v}${ok ? "" : " ⚠"}`;
  });
  els.sourceStatus.innerHTML = `<strong>Sources queried</strong> — ${statusParts.join("<br>")}`;

  renderListingRows(els.soldBody, listingsByType(result, "sold"), {
    showTier: true,
    query: result.query,
  });
  renderListingRows(els.askingBody, listingsByType(result, "asking"), { showLink: true });
  renderListingRows(els.wholesaleBody, listingsByType(result, "wholesale"));
  renderAllListings(els.allBody, result.listings);

  els.meta.textContent = `Valuation ${new Date(result.generated_at).toLocaleString()} · ${result.canonical_key}`;
}

function setupTabs(): void {
  const tabs = document.querySelectorAll(".tab");
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const name = (tab as HTMLButtonElement).dataset.tab;
      tabs.forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
      document.getElementById(`tab-${name}`)?.classList.add("active");
    });
  });
}

function scheduleRecompute(): void {
  if (!lastResult || els.sampleOnly.checked) return;
  if (recomputeTimer != null) window.clearTimeout(recomputeTimer);
  recomputeTimer = window.setTimeout(() => void runRecompute(), 350);
}

async function runRecompute(): Promise<void> {
  if (!lastResult || recomputeInFlight) return;
  const apiUrl = appConfig ? apiBaseUrl(appConfig) : "";
  if (!apiUrl || !appConfig?.apiKey) return;

  const query = getQuery();
  if (!query.manufacturer || !query.model) return;

  recomputeInFlight = true;
  setStatus("Updating deal desk…", "loading");
  saveDealDefaults();

  try {
    const result = await recompute(apiUrl, appConfig.apiKey, {
      ...query,
      ...getDealPayload(),
    });
    renderResult(result);
    setStatus("Deal desk updated (cached market data).", "ok");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("404") || msg.includes("No cached")) {
      setStatus("No cached market — click Valuate first.", "warn");
    } else {
      setStatus(msg, "error");
    }
  } finally {
    recomputeInFlight = false;
  }
}

async function runValuation(): Promise<void> {
  const apiUrl = appConfig ? apiBaseUrl(appConfig) : "";
  if (!apiUrl) {
    setStatus("Set apiUrl in public/config.json (e.g. https://api.modulargunworks.com)", "error");
    return;
  }

  const query = getQuery();
  if (!query.manufacturer || !query.model) {
    setStatus("Enter manufacturer and model, then click Valuate again.", "error");
    showResultsError(
      "Manufacturer and model are required. Example: Sig Sauer / 1911 / 45 ACP."
    );
    return;
  }
  if (!appConfig?.apiKey) {
    setStatus("Missing apiKey in config.json — cannot call the API.", "error");
    showResultsError(
      "Desk config is missing apiKey. On the server run .\\scripts\\fix-desk-api-key.ps1, then Ctrl+F5 this page."
    );
    return;
  }

  const ctx = getContext();
  const deal = getDealPayload();
  const needsCost =
    (ctx === "margin_spotter" || ctx === "vendor_deal") &&
    (!deal.my_cost || deal.my_cost <= 0);
  const live = !els.sampleOnly.checked;
  const useCache = live && !els.forceRefresh.checked;

  els.valuateBtn.disabled = true;
  els.valuateBtn.textContent = "Searching…";
  const statusMsg = needsCost
    ? "No dealer cost entered — showing market comps only (add cost for profit lines)."
    : live
      ? useCache
        ? "Loading cached market or fetching Outdoor Analytics…"
        : "Fetching Outdoor Analytics pricing… (usually under a minute)."
      : "Loading sample data…";
  setStatus(statusMsg, needsCost ? "warn" : "loading");
  showResultsLoading(
    live
      ? "Querying GunBroker Analytics (Outdoor Analytics) for sold comps and active listings."
      : "Loading sample valuation data…"
  );
  saveDealDefaults();

  try {
    const result = await valuate(apiUrl, appConfig.apiKey, {
      ...query,
      ...deal,
      sample_only: els.sampleOnly.checked,
      use_cache: useCache,
      force_refresh: els.forceRefresh.checked && !els.sampleOnly.checked,
    });
    renderResult(result);
    const sold = result.sold_stats.count;
    const asking = result.asking_stats.count;
    const blocked = live && result.listings.length === 0;
    if (blocked) {
      const oaStatus = result.source_status["outdoor-analytics"] ?? "";
      const oaFailed =
        oaStatus.includes("empty") ||
        oaStatus.includes("Unauthorized") ||
        oaStatus.includes("failed");
      const msg = oaFailed
        ? "No pricing data — Outdoor Analytics token missing, expired, or API unreachable. Re-run save-oa-token.ps1 then sync-oa-session.ps1 -UploadOnly."
        : "No listings returned — refresh your Outdoor Analytics token.";
      setStatus(msg, "warn");
    } else {
      setStatus(
        `Done — ${sold} sold · ${asking} asking · ${result.listings.length} raw. Change deal fields to recalc instantly.`,
        "ok"
      );
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const friendly =
      msg.includes("502") || msg.includes("Proxy Error")
        ? "The server timed out. Try again, or use Sample data only to verify the desk loads."
        : msg.length > 400
          ? `${msg.slice(0, 400)}…`
          : msg;
    setStatus(friendly, "error");
    showResultsError(friendly);
  } finally {
    els.valuateBtn.disabled = false;
    els.valuateBtn.textContent = "Valuate";
  }
}

function setStatus(message: string, kind: "ok" | "error" | "warn" | "loading" = "ok"): void {
  els.status.textContent = message;
  els.status.classList.remove("status--error", "status--warn", "status--loading", "status--ok");
  if (kind === "error") els.status.classList.add("status--error");
  else if (kind === "warn") els.status.classList.add("status--warn");
  else if (kind === "loading") els.status.classList.add("status--loading");
  else els.status.classList.add("status--ok");
  els.status.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function applyNavLinks(config: AppConfig): void {
  if (config.companySiteUrl) {
    els.linkCompany.href = config.companySiteUrl;
    els.linkCompany.classList.remove("muted");
  }
  if (config.ledgerUrl) {
    els.linkLedger.href = config.ledgerUrl;
    els.linkLedger.classList.remove("muted");
  }
}

function showApiEndpoint(config: AppConfig): void {
  const base = apiBaseUrl(config);
  if (!base) {
    els.apiEndpoint.textContent = "API: not set — edit config.json";
    els.apiEndpoint.classList.add("api-endpoint--warn");
    return;
  }
  if (base.includes("trycloudflare.com")) {
    els.apiEndpoint.textContent = `API: ${base} (tunnel expired — use http://localhost:8000 locally)`;
    els.apiEndpoint.classList.add("api-endpoint--warn");
    return;
  }
  if (!config.apiKey) {
    els.apiEndpoint.textContent = `API: ${base} (missing apiKey — valuate will fail with 401)`;
    els.apiEndpoint.classList.add("api-endpoint--warn");
    return;
  }
  els.apiEndpoint.textContent = `API: ${base} · Outdoor Analytics`;
  els.apiEndpoint.classList.remove("api-endpoint--warn");
}

const DEAL_INPUT_IDS = [
  els.myCost,
  els.streetRetail,
  els.referenceMsrp,
  els.buyerPremiumPct,
  els.listingAddons,
  els.targetProfit,
  els.minMarginPct,
  els.transferFee,
  els.inboundShip,
  els.sellAssumption,
] as const;

async function init(): Promise<void> {
  loadDealDefaults();
  resetConfigCache();
  try {
    appConfig = await loadConfig();
    showApiEndpoint(appConfig);
    applyNavLinks(appConfig);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    els.apiEndpoint.textContent = `API: config failed to load (${message})`;
    els.apiEndpoint.classList.add("api-endpoint--warn");
    appConfig = null;
  }
  if (appConfig && apiBaseUrl(appConfig)) {
    els.sampleOnly.checked = false;
    els.forceRefresh.checked = true;
  }
  setupTabs();

  [
    els.category,
    els.manufacturer,
    els.model,
    els.variant,
    els.caliber,
    els.condition,
  ].forEach((el) => el.addEventListener("input", updatePreview));

  for (const el of DEAL_INPUT_IDS) {
    el.addEventListener("input", () => {
      saveDealDefaults();
      scheduleRecompute();
    });
    el.addEventListener("change", () => {
      saveDealDefaults();
      scheduleRecompute();
    });
  }

  updatePreview();
  els.valuateBtn.addEventListener("click", () => void runValuation());

  document.querySelectorAll('input[name="context"]').forEach((el) => {
    el.addEventListener("change", () => {
      syncContextPanels();
      saveDealDefaults();
      scheduleRecompute();
    });
  });

  els.sampleOnly.addEventListener("change", () => {
    if (els.sampleOnly.checked) els.forceRefresh.checked = false;
  });

  syncContextPanels();
  void initInventoryUi(appConfig, inventoryEls);
}

void init();
