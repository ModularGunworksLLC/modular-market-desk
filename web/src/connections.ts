import "./style.css";
import {
  apiBaseUrl,
  fetchConnections,
  loadConfig,
  refreshConnection,
  uploadSession,
  type ConnectionRow,
} from "./connections-api";
import { initInventoryUi, type InventoryUiElements } from "./inventory-ui";

const els = {
  list: document.getElementById("connections-list") as HTMLDivElement,
  status: document.getElementById("connections-status") as HTMLParagraphElement,
  apiEndpoint: document.getElementById("api-endpoint") as HTMLParagraphElement,
  refreshAll: document.getElementById("refresh-all-btn") as HTMLButtonElement,
  linkCompany: document.getElementById("link-company") as HTMLAnchorElement,
  linkLedger: document.getElementById("link-ledger") as HTMLAnchorElement,
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

function statusBadge(row: ConnectionRow): { text: string; className: string } {
  if (row.kind === "public") {
    return { text: "Public — no login", className: "conn-badge conn-badge--public" };
  }
  if (row.session_status === "ok") {
    return { text: "Connected", className: "conn-badge conn-badge--ok" };
  }
  if (row.session_status === "stale") {
    return { text: "Stale session", className: "conn-badge conn-badge--warn" };
  }
  return { text: "Not connected", className: "conn-badge conn-badge--bad" };
}

function sessionLine(row: ConnectionRow): string {
  if (row.kind === "public") return row.notes;
  if (!row.session_exists) return "No saved browser session on the server.";
  const age =
    row.session_age_hours != null
      ? row.session_age_hours < 24
        ? `${row.session_age_hours}h ago`
        : `${Math.round(row.session_age_hours / 24)}d ago`
      : "unknown age";
  const kb = row.session_size_bytes
    ? `${Math.round(row.session_size_bytes / 1024)} KB`
    : "";
  return `Session file: ${kb} · updated ${age}`;
}

function renderCard(row: ConnectionRow): HTMLElement {
  const card = document.createElement("article");
  card.className = "conn-card panel";
  const badge = statusBadge(row);
  const creds = row.credentials_configured
    ? "Credentials on server"
    : "No password in sites.local.yaml";

  card.innerHTML = `
    <div class="conn-card-head">
      <h3>${row.label}</h3>
      <span class="${badge.className}">${badge.text}</span>
    </div>
    <p class="muted conn-meta">${row.kind} · ${row.used_by.join(", ")}</p>
    <p class="conn-detail">${sessionLine(row)}</p>
    <p class="muted conn-creds">${creds}</p>
  `;

  if (row.kind === "public") {
    const note = document.createElement("p");
    note.className = "muted";
    note.textContent =
      "Log in from your home PC, run Valuate once, then copy valuation_cache to the server (see deploy/MARKET-SOURCES.md).";
    card.appendChild(note);
    return card;
  }

  const actions = document.createElement("div");
  actions.className = "conn-actions";

  if (row.can_auto_login) {
    const autoBtn = document.createElement("button");
    autoBtn.type = "button";
    autoBtn.className = "secondary";
    autoBtn.textContent = "Auto-login (server)";
    autoBtn.addEventListener("click", () => void runRefresh(row.id, autoBtn));
    actions.appendChild(autoBtn);
  }

  const uploadLabel = document.createElement("label");
  uploadLabel.className = "secondary upload-label";
  uploadLabel.textContent = "Upload session (.json)";
  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = ".json,application/json";
  fileInput.hidden = true;
  uploadLabel.appendChild(fileInput);
  fileInput.addEventListener("change", () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    void runUpload(row.id, file);
    fileInput.value = "";
  });
  uploadLabel.addEventListener("click", (e) => {
    if (e.target === uploadLabel) fileInput.click();
  });
  actions.appendChild(uploadLabel);

  const pcHint = document.createElement("p");
  pcHint.className = "muted conn-pc-hint";
  pcHint.innerHTML = `PC login: <code>scripts\\connect-site.ps1 ${row.id}</code>`;
  actions.appendChild(pcHint);

  if (row.login_url) {
    const link = document.createElement("a");
    link.href = row.login_url;
    link.target = "_blank";
    link.rel = "noopener";
    link.className = "muted";
    link.textContent = "Open login page";
    actions.appendChild(link);
  }

  card.appendChild(actions);
  return card;
}

function setStatus(msg: string, kind: "ok" | "error" | "loading" | "warn" = "ok"): void {
  els.status.textContent = msg;
  els.status.classList.remove("status--error", "status--loading", "status--ok", "status--warn");
  if (kind === "error") els.status.classList.add("status--error");
  else if (kind === "loading") els.status.classList.add("status--loading");
  else if (kind === "warn") els.status.classList.add("status--warn");
  else els.status.classList.add("status--ok");
}

let appConfig: Awaited<ReturnType<typeof loadConfig>> | null = null;

async function runRefresh(siteId: string, btn: HTMLButtonElement): Promise<void> {
  if (!appConfig) return;
  const prev = btn.textContent;
  btn.disabled = true;
  btn.textContent = "Logging in…";
  setStatus(`Auto-login for ${siteId}… (up to 2 min)`, "loading");
  try {
    const result = await refreshConnection(appConfig, siteId);
    setStatus(result.message, "ok");
    await loadList();
  } catch (err) {
    setStatus(err instanceof Error ? err.message : String(err), "error");
  } finally {
    btn.disabled = false;
    btn.textContent = prev;
  }
}

async function runUpload(siteId: string, file: File): Promise<void> {
  if (!appConfig) return;
  setStatus(`Uploading ${file.name}…`, "loading");
  try {
    const text = await file.text();
    const payload = JSON.parse(text) as object;
    const result = await uploadSession(appConfig, siteId, payload);
    setStatus(result.message, "ok");
    await loadList();
  } catch (err) {
    setStatus(err instanceof Error ? err.message : String(err), "error");
  }
}

async function loadList(): Promise<void> {
  if (!appConfig) return;
  const data = await fetchConnections(appConfig);
  els.list.replaceChildren();
  for (const row of data.valuation) {
    els.list.appendChild(renderCard(row));
  }
  if (data.dealers.length) {
    const h = document.createElement("h2");
    h.className = "conn-section-title";
    h.textContent = "Other wholesalers";
    els.list.appendChild(h);
    for (const row of data.dealers) {
      els.list.appendChild(renderCard(row));
    }
  }
}

async function refreshAllAuto(): Promise<void> {
  if (!appConfig) return;
  const data = await fetchConnections(appConfig);
  const targets = data.valuation.filter((r) => r.can_auto_login);
  if (!targets.length) {
    setStatus("No sites with server credentials — use PC connect script or upload session JSON.", "warn");
    return;
  }
  els.refreshAll.disabled = true;
  for (const row of targets) {
    setStatus(`Refreshing ${row.label}…`, "loading");
    try {
      await refreshConnection(appConfig, row.id);
    } catch {
      /* continue */
    }
  }
  await loadList();
  setStatus("Finished auto-login pass.", "ok");
  els.refreshAll.disabled = false;
}

function showApiEndpoint(config: Awaited<ReturnType<typeof loadConfig>>): void {
  const base = apiBaseUrl(config);
  els.apiEndpoint.textContent = base ? `API: ${base}` : "API: not set";
}

async function init(): Promise<void> {
  appConfig = await loadConfig();
  showApiEndpoint(appConfig);
  if (appConfig.companySiteUrl) els.linkCompany.href = appConfig.companySiteUrl;
  if (appConfig.ledgerUrl) els.linkLedger.href = appConfig.ledgerUrl;

  if (!apiBaseUrl(appConfig)) {
    setStatus("Set apiUrl and apiKey in public/config.json", "error");
    return;
  }

  els.refreshAll.addEventListener("click", () => void refreshAllAuto());
  void initInventoryUi(appConfig, inventoryEls);
  try {
    await loadList();
    setStatus("Connect sites and import vendor CSV catalogs below.", "ok");
  } catch (err) {
    setStatus(err instanceof Error ? err.message : String(err), "error");
  }
}

void init();
