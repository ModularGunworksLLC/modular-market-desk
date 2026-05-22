import { valuate } from "./api";
import { apiBaseUrl, loadConfig, type AppConfig } from "./config";
import type { ContextMode, FirearmQuery, ValuationResult } from "./types";
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
  myCost: document.getElementById("my-cost") as HTMLInputElement,
  sampleOnly: document.getElementById("sample-only") as HTMLInputElement,
  preview: document.getElementById("preview") as HTMLParagraphElement,
  valuateBtn: document.getElementById("valuate-btn") as HTMLButtonElement,
  status: document.getElementById("status") as HTMLParagraphElement,
  emptyState: document.getElementById("empty-state") as HTMLDivElement,
  results: document.getElementById("results") as HTMLDivElement,
  soldSummary: document.getElementById("sold-summary") as HTMLParagraphElement,
  askingSummary: document.getElementById("asking-summary") as HTMLParagraphElement,
  wholesaleSummary: document.getElementById("wholesale-summary") as HTMLParagraphElement,
  insightHeadline: document.getElementById("insight-headline") as HTMLParagraphElement,
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
};

function getContext(): ContextMode {
  const checked = document.querySelector('input[name="context"]:checked') as HTMLInputElement;
  return (checked?.value as ContextMode) || "auction_sniper";
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
    mpn: "",
    exclude_tokens: [],
  };
}

function updatePreview(): void {
  els.preview.textContent = `Searching: ${searchPreview(getQuery())}`;
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
  opts: { showLink?: boolean } = {}
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
    tr.innerHTML = `
      <td>${l.title}</td>
      <td>${formatMoney(l.price)}</td>
      <td>${l.condition || "—"}</td>
      <td>${l.source}</td>
      <td>${opts.showLink ? link : `${l.match_score.toFixed(0)}`}</td>
    `;
    tbody.appendChild(tr);
  }
}

function renderStatsTable(result: ValuationResult): void {
  const rows = [
    ["Sold (90d)", result.sold_stats],
    ["Asking", result.asking_stats],
    ["Wholesale", result.wholesale_stats],
    ["Estimate", result.estimate_stats],
  ] as const;
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
  const details: string[] = [];
  if (ins.max_bid != null) details.push(`Max bid: ${formatMoney(ins.max_bid)}`);
  if (ins.promo_ok != null) details.push(ins.promo_ok ? "Promo: OK" : "Promo: SUSPICIOUS");
  if (ins.margin_pct != null) details.push(`Margin: ${ins.margin_pct.toFixed(1)}%`);
  if (ins.my_cost != null) details.push(`Cost: ${formatMoney(ins.my_cost)}`);
  els.insightDetail.textContent = details.join(" · ");
}

function renderResult(result: ValuationResult): void {
  lastResult = result;
  els.emptyState.classList.add("hidden");
  els.results.classList.remove("hidden");

  els.soldSummary.textContent = formatStats(result.sold_stats);
  els.askingSummary.textContent = formatStats(result.asking_stats);
  els.wholesaleSummary.textContent = formatStats(result.wholesale_stats);

  renderInsight(result);
  renderStatsTable(result);
  els.trends.innerHTML = renderTrendBars(result.trends);

  const statusParts = Object.entries(result.source_status).map(
    ([k, v]) => `${k}: ${v}`
  );
  els.sourceStatus.textContent = `Sources — ${statusParts.join(" · ")}`;

  renderListingRows(els.soldBody, listingsByType(result, "sold"));
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
    els.status.textContent = "Set apiUrl in public/config.json (e.g. http://localhost:8000)";
    return;
  }

  const query = getQuery();
  if (!query.manufacturer || !query.model) {
    els.status.textContent = "Manufacturer and model are required.";
    return;
  }

  const myCostRaw = els.myCost.value.trim();
  const my_cost = myCostRaw ? Number(myCostRaw) : null;

  els.valuateBtn.disabled = true;
  els.status.textContent = "Valuating… (may take 30–120 seconds for live sources)";

  try {
    const result = await valuate(apiUrl, appConfig?.apiKey ?? "", {
      ...query,
      context: getContext(),
      my_cost,
      sample_only: els.sampleOnly.checked,
    });
    renderResult(result);
    els.status.textContent = "Done.";
  } catch (err) {
    els.status.textContent = `Error: ${err instanceof Error ? err.message : String(err)}`;
  } finally {
    els.valuateBtn.disabled = false;
  }
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

async function init(): Promise<void> {
  appConfig = await loadConfig();
  applyNavLinks(appConfig);
  setupTabs();

  [
    els.category,
    els.manufacturer,
    els.model,
    els.variant,
    els.caliber,
    els.condition,
  ].forEach((el) => el.addEventListener("input", updatePreview));

  updatePreview();
  els.valuateBtn.addEventListener("click", () => void runValuation());

  document.querySelectorAll('input[name="context"]').forEach((el) => {
    el.addEventListener("change", () => {
      if (lastResult) {
        void runValuation();
      }
    });
  });
}

void init();
