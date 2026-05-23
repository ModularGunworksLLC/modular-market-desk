import { apiBaseUrl, loadConfig, type AppConfig } from "./config";

export type ConnectionRow = {
  id: string;
  label: string;
  kind: "market" | "wholesale" | "public";
  login_url: string;
  notes: string;
  credentials_configured: boolean;
  can_auto_login: boolean;
  session_exists: boolean;
  session_age_hours: number | null;
  session_size_bytes: number | null;
  session_status: "missing" | "stale" | "ok";
  used_by: string[];
};

export type ConnectionsResponse = {
  valuation: ConnectionRow[];
  dealers: ConnectionRow[];
  hint: string;
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

export async function fetchConnections(config: AppConfig): Promise<ConnectionsResponse> {
  const res = await apiFetch(config, "/api/connections");
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as ConnectionsResponse;
}

export async function refreshConnection(
  config: AppConfig,
  siteId: string
): Promise<{ ok: boolean; message: string; connection?: ConnectionRow }> {
  const res = await apiFetch(config, `/api/connections/${siteId}/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode: "auto" }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail =
      typeof body === "object" && body && "detail" in body
        ? String((body as { detail: string }).detail)
        : `HTTP ${res.status}`;
    throw new Error(detail);
  }
  return body as { ok: boolean; message: string; connection?: ConnectionRow };
}

export async function uploadSession(
  config: AppConfig,
  siteId: string,
  storageState: object
): Promise<{ ok: boolean; message: string; connection?: ConnectionRow }> {
  const res = await apiFetch(config, `/api/connections/${siteId}/session`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(storageState),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail =
      typeof body === "object" && body && "detail" in body
        ? String((body as { detail: string }).detail)
        : `HTTP ${res.status}`;
    throw new Error(detail);
  }
  return body as { ok: boolean; message: string; connection?: ConnectionRow };
}

export { loadConfig, apiBaseUrl };
