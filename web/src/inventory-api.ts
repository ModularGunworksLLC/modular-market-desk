import { apiBaseUrl, type AppConfig } from "./config";

export type InventoryCatalog = {
  source: string;
  count: number;
  generated_at: string;
  imported_from: string;
};

export type InventoryListResponse = {
  catalogs: InventoryCatalog[];
  presets: string[];
  hint: string;
};

export type InventoryImportResult = {
  ok: boolean;
  source: string;
  preset: string;
  rows_imported: number;
  total_rows: number;
  replace: boolean;
  saved_to: string;
  uploaded_as: string;
};

async function apiFetch(
  config: AppConfig,
  path: string,
  init?: RequestInit
): Promise<Response> {
  const base = apiBaseUrl(config).replace(/\/$/, "");
  const headers: Record<string, string> = {
    ...(init?.headers as Record<string, string> | undefined),
  };
  if (config.apiKey) headers["X-API-Key"] = config.apiKey;
  return fetch(`${base}${path}`, { ...init, headers });
}

export async function fetchInventory(config: AppConfig): Promise<InventoryListResponse> {
  const res = await apiFetch(config, "/api/inventory");
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(detail || `HTTP ${res.status}`);
  }
  return (await res.json()) as InventoryListResponse;
}

export async function importInventoryCsv(
  config: AppConfig,
  file: File,
  options: { source: string; preset: string; replace: boolean }
): Promise<InventoryImportResult> {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("source", options.source.trim());
  fd.append("preset", options.preset.trim() || options.source.trim());
  fd.append("replace", options.replace ? "true" : "false");

  const res = await apiFetch(config, "/api/inventory/import", {
    method: "POST",
    body: fd,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail =
      typeof body === "object" && body && "detail" in body
        ? String((body as { detail: string }).detail)
        : `HTTP ${res.status}`;
    throw new Error(detail);
  }
  return body as InventoryImportResult;
}
