import { liveSearch } from "./api";
import { apiBaseUrl, loadConfig, type AppConfig } from "./config";
import { searchCatalog, type SearchFilters } from "./search";
import type { DataBundle, ResultRow } from "./types";

const DATA_URL = `${import.meta.env.BASE_URL}data/bundle.json`;

const queryEl = document.getElementById("query") as HTMLInputElement;
const filterSemi = document.getElementById("filter-semi") as HTMLInputElement;
const filterStock = document.getElementById("filter-stock") as HTMLInputElement;
const filterSale = document.getElementById("filter-sale") as HTMLInputElement;
const filterMargin = document.getElementById("filter-margin") as HTMLInputElement;
const liveLookupEl = document.getElementById("live-lookup") as HTMLInputElement;
const searchBtn = document.getElementById("search-btn") as HTMLButtonElement;
const statusEl = document.getElementById("status") as HTMLParagraphElement;
const metaEl = document.getElementById("meta") as HTMLParagraphElement;
const tbody = document.getElementById("results-body") as HTMLTableSectionElement;
const emptyEl = document.getElementById("empty") as HTMLParagraphElement;
const linkCompany = document.getElementById("link-company") as HTMLAnchorElement;
const linkLedger = document.getElementById("link-ledger") as HTMLAnchorElement;

let bundle: DataBundle | null = null;
let appConfig: AppConfig | null = null;

function formatMoney(n: number): string {
  return n > 0 ? `$${n.toFixed(2)}` : "—";
}

function formatPct(n: number): string {
  return `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;
}

function getFilters(): SearchFilters {
  return {
    query: queryEl.value,
    semiAutoOnly: filterSemi.checked,
    inStockOnly: filterStock.checked,
    onSaleOnly: filterSale.checked,
    minMarginPct: Number(filterMargin.value) || 0,
  };
}

function renderRows(rows: ResultRow[]): void {
  tbody.replaceChildren();
  for (const row of rows) {
    const tr = document.createElement("tr");
    const { item, market_median, spread, margin_pct } = row;
    const sourceLabel =
      item.source === "gundeals"
        ? "Gun.deals (retail)"
        : item.source;
    tr.innerHTML = `
      <td><strong>${item.manufacturer} ${item.model}</strong><br><span class="muted">${sourceLabel}</span></td>
      <td>${item.caliber || "—"}</td>
      <td>${formatMoney(item.dealer_price)}</td>
      <td>${formatMoney(market_median)}</td>
      <td>${formatMoney(spread)}</td>
      <td class="${margin_pct >= 15 ? "good" : margin_pct >= 0 ? "ok" : "bad"}">${formatPct(margin_pct)}</td>
      <td>${item.in_stock ? "Yes" : "No"}</td>
      <td>${item.on_sale ? "Yes" : "—"}</td>
    `;
    tbody.appendChild(tr);
  }
  emptyEl.classList.toggle("hidden", rows.length > 0);
}

function displayBundle(data: DataBundle, label: string): void {
  bundle = data;
  const rows = searchCatalog(data, getFilters());
  renderRows(rows);
  metaEl.textContent = `${rows.length} match(es) · ${label} · ${new Date(data.generated_at).toLocaleString()}`;
}

async function runSearch(): Promise<void> {
  const filters = getFilters();
  const apiUrl = appConfig ? apiBaseUrl(appConfig) : "";

  if (liveLookupEl.checked && apiUrl) {
    searchBtn.disabled = true;
    statusEl.textContent = "Live lookup running… (may take 1–2 minutes)";
    try {
      const data = await liveSearch(apiUrl, appConfig?.apiKey ?? "", filters);
      displayBundle(data, "live");
      statusEl.textContent = "Live lookup complete.";
    } catch (err) {
      statusEl.textContent = `Live lookup failed: ${err instanceof Error ? err.message : String(err)}`;
    } finally {
      searchBtn.disabled = false;
    }
    return;
  }

  if (!bundle) {
    statusEl.textContent = "Data not loaded yet.";
    return;
  }
  displayBundle(bundle, "cached");
  statusEl.textContent = "";
}

async function loadData(): Promise<void> {
  statusEl.textContent = "Loading catalog…";
  try {
    const res = await fetch(DATA_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    bundle = (await res.json()) as DataBundle;
    statusEl.textContent = "Ready — search cached data or enable live lookup.";
    displayBundle(bundle, "cached");
  } catch (err) {
    statusEl.textContent = `Failed to load data: ${err instanceof Error ? err.message : String(err)}`;
  }
}

function applyNavLinks(config: AppConfig): void {
  if (config.companySiteUrl) {
    linkCompany.href = config.companySiteUrl;
    linkCompany.classList.remove("muted");
  }
  if (config.ledgerUrl) {
    linkLedger.href = config.ledgerUrl;
    linkLedger.classList.remove("muted");
  }
}

function configureLiveLookup(config: AppConfig): void {
  const apiUrl = apiBaseUrl(config);
  if (apiUrl) {
    liveLookupEl.disabled = false;
    liveLookupEl.parentElement?.classList.remove("live-disabled");
  } else {
    liveLookupEl.checked = false;
    liveLookupEl.disabled = true;
    liveLookupEl.parentElement?.classList.add("live-disabled");
  }
}

async function init(): Promise<void> {
  appConfig = await loadConfig();
  applyNavLinks(appConfig);
  configureLiveLookup(appConfig);
  await loadData();
}

searchBtn.addEventListener("click", () => void runSearch());
queryEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter") void runSearch();
});

void init();
