import type { RecomputePayload, ValuatePayload, ValuationResult } from "./types";

async function postJson<T>(
  apiUrl: string,
  apiKey: string,
  path: string,
  payload: unknown,
  timeoutMs: number
): Promise<T> {
  const base = apiUrl.replace(/\/$/, "");
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (apiKey) headers["X-API-Key"] = apiKey;

  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);

  let res: Response;
  try {
    res = await fetch(`${base}${path}`, {
      method: "POST",
      headers,
      signal: controller.signal,
      body: JSON.stringify(payload),
    });
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      throw new Error("Request timed out. Try again.");
    }
    throw e;
  } finally {
    window.clearTimeout(timer);
  }

  if (!res.ok) {
    const detail = await res.text();
    let message = detail || `HTTP ${res.status}`;
    try {
      const parsed = JSON.parse(detail) as { detail?: string | { msg?: string }[] };
      if (typeof parsed.detail === "string") {
        message = parsed.detail;
      } else if (Array.isArray(parsed.detail) && parsed.detail[0]?.msg) {
        message = parsed.detail[0].msg;
      }
    } catch {
      /* use raw text */
    }
    if (res.status === 401) {
      message = `Invalid API key (401). Hard-refresh the desk (Ctrl+F5) and check config.json has apiKey set.`;
    }
    throw new Error(message);
  }

  return (await res.json()) as T;
}

export async function valuate(
  apiUrl: string,
  apiKey: string,
  payload: ValuatePayload
): Promise<ValuationResult> {
  const timeoutMs = payload.sample_only ? 120_000 : 960_000;
  return postJson<ValuationResult>(apiUrl, apiKey, "/api/valuate", {
    ...payload,
    use_cache: payload.use_cache ?? false,
    force_refresh: payload.force_refresh ?? true,
    sample_only: payload.sample_only ?? false,
  }, timeoutMs);
}

export async function recompute(
  apiUrl: string,
  apiKey: string,
  payload: RecomputePayload
): Promise<ValuationResult> {
  return postJson<ValuationResult>(apiUrl, apiKey, "/api/recompute", payload, 60_000);
}
