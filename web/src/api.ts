import type { ValuatePayload, ValuationResult } from "./types";

export async function valuate(
  apiUrl: string,
  apiKey: string,
  payload: ValuatePayload
): Promise<ValuationResult> {
  const base = apiUrl.replace(/\/$/, "");
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (apiKey) headers["X-API-Key"] = apiKey;

  const res = await fetch(`${base}/api/valuate`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      ...payload,
      use_cache: payload.use_cache ?? true,
      sample_only: payload.sample_only ?? false,
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(detail || `HTTP ${res.status}`);
  }

  return (await res.json()) as ValuationResult;
}
