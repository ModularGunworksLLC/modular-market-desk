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

  const controller = new AbortController();
  const timeoutMs = payload.sample_only ? 120_000 : 960_000;
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);

  let res: Response;
  try {
    res = await fetch(`${base}/api/valuate`, {
      method: "POST",
      headers,
      signal: controller.signal,
      body: JSON.stringify({
        ...payload,
        use_cache: payload.use_cache ?? false,
        force_refresh: payload.force_refresh ?? true,
        sample_only: payload.sample_only ?? false,
      }),
    });
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      throw new Error(
        "Request timed out in the browser. Live search can take up to 15 minutes — try again, or use Sample data only."
      );
    }
    throw e;
  } finally {
    window.clearTimeout(timer);
  }

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(detail || `HTTP ${res.status}`);
  }

  return (await res.json()) as ValuationResult;
}
