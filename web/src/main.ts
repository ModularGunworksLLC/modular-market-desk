import { valuate } from "./api";
import { apiBaseUrl, loadConfig, resetConfigCache, type AppConfig } from "./config";
import type { ContextMode, FirearmQuery, MarketListing, PriceStats, ValuationResult } from "./types";
import {
  formatMoney,
  formatStats,
  listingsByType,
  renderTrendBars,
  searchPreview,
} from "./valuation-ui";

let appConfig: AppConfig | null = null;
let lastResult: ValuationResult | null = null;

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
  auctionFees: document.getElementById("auction-fees") as HTMLDivElement,
  sampleOnly: document.getElementById("sample-only") as HTMLInputElement,
  forceRefresh: document.getElementById("force-refresh") as HTMLInputElement,
  preview: document.getElementById("preview") as HTMLParagraphElement,
  valuateBtn: document.getElementById("valuate-btn") as HTMLButtonElement,
  status: document.getElementById("status") as HTMLParagraphElement,
  emptyState: document.getElementById("empty-state") as HTMLDivElement,
  results: document.getElementById("results") as HTMLDivElement,
  soldSummaryLabel: document.getElementById("sold-summary-label") as HTMLHeadingElement,
  soldSummary: document.getElementById("sold-summary") as HTMLParagraphElement,
  askingSummary: document.getElementById("asking-summary") as HTMLParagraphElement,
  wholesaleSummary: document.getElementById("wholesale-summary") as HTMLParagraphElement,
  insightHeadline: document.getElementById("insight-headline") as HTMLParagraphElement,
  insightBlocks: document.getElementById("insight-blocks") as HTMLDivElement,
  insightDetail: document.getElementById("insight-detail") as HTMLParagraphElement,
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
};

function getContext(): ContextMode {
  const checked = document.querySelector('input[name="context"]:checked') as HTMLInputElement;
  return (checked?.value as ContextMode) || "margin_spotter";
}

const DEALER_HINTS: Record<ContextMode, string> = {
  margin_spotter:
    "Margin spotter: enter your cost. Compares sold comps and shows local vs GunBroker profit.",
  vendor_deal:
    "Vendor deal: enter your cost and their sale price (not MSRP). Queries TrueGunValue, GunBroker, and Gun.deals.",
  auction_sniper:
    "Auction sniper: max hammer bid from sold comps and buyer premium.",
};

function syncContextPanels(): void {
  const ctx = getContext();
  els.auctionFees.classList.toggle("hidden", ctx !== "auction_sniper");
  els.streetRetailField.classList.toggle("hidden", ctx !== "vendor_deal");
  els.msrpField.classList.toggle("hidden", ctx !== "vendor_deal");
  const hint = document.getElementById("dealer-hint");
  if (hint) hint.textContent = DEALER_HINTS[ctx];
}

function getBuyerPremiumPct(): number | null {
  if (getContext() !== "auction_sniper") return null;
  const raw = els.buyerPremiumPct.value.trim();
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function getListingAddons(): number {
  const raw = els.listingAddons.value.trim();
  const n = raw ? Number(raw) : 10;
  return Number.isFinite(n) ? n : 10;
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

function renderInsight(result: ValuationResult): void {
  const ins = result.insights;
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

  const ctx = getContext();
  const details: string[] = [];
  if (ctx === "auction_sniper") {
    if (ins.max_bid != null) details.push(`Max hammer: ${formatMoney(ins.max_bid)}`);
    const premium = ins.assumptions?.buyer_premium_pct;
    if (typeof premium === "number") details.push(`Buyer premium: ${premium}%`);
  } else {
    if (ins.assumptions?.promo_ok === true) details.push("Vendor promo: good");
    if (ins.assumptions?.promo_ok === false) details.push("Vendor promo: weak");
    if (ins.assumptions?.resale_ok === true) details.push("Resale room: OK");
    if (ins.assumptions?.resale_ok === false) details.push("Resale room: thin");
  }
  els.insightDetail.textContent = details.join(" · ");
}

function renderResult(result: ValuationResult): void {
  lastResult = result;
  els.emptyState.classList.add("hidden");
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

async function runValuation(): Promise<void> {
  const apiUrl = appConfig ? apiBaseUrl(appConfig) : "";
  if (!apiUrl) {
    setStatus("Set apiUrl in public/config.json (e.g. https://api.modulargunworks.com)", "error");
    return;
  }

  const query = getQuery();
  if (!query.manufacturer || !query.model) {
    setStatus("Enter manufacturer and model, then click Valuate again.", "error");
    return;
  }

  const ctx = getContext();
  const myCostRaw = els.myCost.value.trim();
  const my_cost = myCostRaw ? Number(myCostRaw) : null;
  const streetRaw = els.streetRetail.value.trim();
  const street_retail = streetRaw ? Number(streetRaw) : null;
  const msrpRaw = els.referenceMsrp.value.trim();
  const reference_msrp = msrpRaw ? Number(msrpRaw) : null;

  els.valuateBtn.disabled = true;
  els.valuateBtn.textContent = "Searching…";
  const live = !els.sampleOnly.checked;
  const needsCost = (ctx === "margin_spotter" || ctx === "vendor_deal") && (!my_cost || my_cost <= 0);
  setStatus(
    needsCost
      ? "No dealer cost entered — showing market comps only (add cost for profit lines)."
      : live
        ? "Searching TrueGunValue, GunBroker, Gun.deals… (30–120 seconds). Please wait."
        : "Loading sample data…",
    needsCost ? "warn" : "loading"
  );

  try {
    const result = await valuate(apiUrl, appConfig?.apiKey ?? "", {
      ...query,
      context: getContext(),
      my_cost,
      street_retail,
      reference_msrp,
      buyer_premium_pct: getBuyerPremiumPct(),
      listing_addons: getListingAddons(),
      sample_only: els.sampleOnly.checked,
      use_cache: els.sampleOnly.checked && !els.forceRefresh.checked,
      force_refresh: els.forceRefresh.checked && !els.sampleOnly.checked,
    });
    renderResult(result);
    const sold = result.sold_stats.count;
    const asking = result.asking_stats.count;
    setStatus(
      `Done — ${sold} sold · ${asking} asking · ${result.listings.length} raw listings.`,
      "ok"
    );
  } catch (err) {
    setStatus(`Error: ${err instanceof Error ? err.message : String(err)}`, "error");
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
    els.apiEndpoint.textContent = "API: not set — edit public/config.json";
    els.apiEndpoint.classList.add("api-endpoint--warn");
    return;
  }
  if (base.includes("trycloudflare.com")) {
    els.apiEndpoint.textContent = `API: ${base} (tunnel expired — use http://localhost:8000 locally)`;
    els.apiEndpoint.classList.add("api-endpoint--warn");
    return;
  }
  els.apiEndpoint.textContent = `API: ${base}`;
  els.apiEndpoint.classList.remove("api-endpoint--warn");
}

async function init(): Promise<void> {
  resetConfigCache();
  appConfig = await loadConfig();
  showApiEndpoint(appConfig);
  applyNavLinks(appConfig);
  if (apiBaseUrl(appConfig)) {
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

  const rerunAuctionFees = () => {
    if (lastResult && getContext() === "auction_sniper") {
      void runValuation();
    }
  };
  els.buyerPremiumPct.addEventListener("change", rerunAuctionFees);
  els.listingAddons.addEventListener("change", rerunAuctionFees);

  updatePreview();
  els.valuateBtn.addEventListener("click", () => void runValuation());

  document.querySelectorAll('input[name="context"]').forEach((el) => {
    el.addEventListener("change", () => {
      syncContextPanels();
      if (lastResult) {
        void runValuation();
      }
    });
  });

  syncContextPanels();
}

void init();
