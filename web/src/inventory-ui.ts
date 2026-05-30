import type { AppConfig } from "./config";
import { fetchInventory, importInventoryCsv, type InventoryCatalog } from "./inventory-api";

export type InventoryUiElements = {
  source: HTMLInputElement;
  preset: HTMLSelectElement;
  replace: HTMLInputElement;
  file: HTMLInputElement;
  fileLabel: HTMLElement;
  importBtn: HTMLButtonElement;
  catalogList: HTMLElement;
  status?: (msg: string, kind: "ok" | "error" | "warn" | "loading") => void;
};

function formatCatalogLine(c: InventoryCatalog): string {
  const when = c.generated_at
    ? new Date(c.generated_at).toLocaleString()
    : "unknown";
  return `${c.source}: ${c.count.toLocaleString()} items · updated ${when}`;
}

export async function refreshInventoryCatalogs(
  config: AppConfig,
  els: InventoryUiElements
): Promise<void> {
  const data = await fetchInventory(config);
  els.preset.replaceChildren();
  for (const name of data.presets) {
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = name;
    els.preset.appendChild(opt);
  }
  if (!els.source.value && data.presets.includes("lipseys")) {
    els.source.value = "lipseys";
    els.preset.value = "lipseys";
  }

  els.catalogList.replaceChildren();
  if (!data.catalogs.length) {
    const li = document.createElement("li");
    li.textContent = "No catalogs imported yet.";
    els.catalogList.appendChild(li);
    return;
  }
  for (const cat of data.catalogs) {
    const li = document.createElement("li");
    li.textContent = formatCatalogLine(cat);
    els.catalogList.appendChild(li);
  }
}

export function bindInventoryImport(
  config: AppConfig | null,
  els: InventoryUiElements
): void {
  els.fileLabel.addEventListener("click", () => els.file.click());
  els.file.addEventListener("change", () => {
    const name = els.file.files?.[0]?.name;
    els.fileLabel.textContent = name ? `Selected: ${name}` : "Choose CSV file…";
  });

  els.importBtn.addEventListener("click", () => void runImport(config, els));

  els.source.addEventListener("change", () => {
    const s = els.source.value.trim().toLowerCase();
    if (s && [...els.preset.options].some((o) => o.value === s)) {
      els.preset.value = s;
    }
  });
}

async function runImport(
  config: AppConfig | null,
  els: InventoryUiElements
): Promise<void> {
  if (!config?.apiKey || !config.apiUrl) {
    els.status?.("Set apiUrl and apiKey in config.json first.", "error");
    return;
  }
  const file = els.file.files?.[0];
  const source = els.source.value.trim();
  if (!file) {
    els.status?.("Choose a CSV file first.", "warn");
    return;
  }
  if (!source) {
    els.status?.("Enter a source id (e.g. lipseys, zanders).", "warn");
    return;
  }

  els.importBtn.disabled = true;
  const prev = els.importBtn.textContent;
  els.importBtn.textContent = "Importing…";
  els.status?.(`Importing ${file.name}…`, "loading");

  try {
    const result = await importInventoryCsv(config, file, {
      source,
      preset: els.preset.value,
      replace: els.replace.checked,
    });
    els.status?.(
      `Imported ${result.rows_imported.toLocaleString()} rows → ${result.total_rows.toLocaleString()} total (${result.source}). Valuate to see Wholesale tab.`,
      "ok"
    );
    els.file.value = "";
    els.fileLabel.textContent = "Choose CSV file…";
    await refreshInventoryCatalogs(config, els);
  } catch (err) {
    els.status?.(err instanceof Error ? err.message : String(err), "error");
  } finally {
    els.importBtn.disabled = false;
    els.importBtn.textContent = prev || "Import CSV";
  }
}

export async function initInventoryUi(
  config: AppConfig | null,
  els: InventoryUiElements
): Promise<void> {
  bindInventoryImport(config, els);
  if (!config?.apiKey || !config.apiUrl) return;
  try {
    await refreshInventoryCatalogs(config, els);
  } catch (err) {
    els.status?.(
      err instanceof Error ? err.message : "Could not load inventory list",
      "warn"
    );
  }
}
