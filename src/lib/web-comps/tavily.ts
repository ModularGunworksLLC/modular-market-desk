/**
 * Tavily Search client — returns organic hits for local web-comps ingest.
 * Identity-only queries; never send fee math or vault secrets.
 */

import "server-only";

import type { WebSearchHit } from "./types";

export class TavilyError extends Error {
  constructor(
    message: string,
    readonly status = 502,
  ) {
    super(message);
    this.name = "TavilyError";
  }
}

function getApiKey(): string | null {
  return process.env.TAVILY_API_KEY?.trim() || null;
}

export function tavilyConfigured(): boolean {
  return Boolean(getApiKey());
}

export async function searchOrganic(
  query: string,
  opts?: { maxResults?: number },
): Promise<WebSearchHit[]> {
  const key = getApiKey();
  if (!key) {
    throw new TavilyError("TAVILY_API_KEY is not set.", 503);
  }

  const maxResults = Math.min(10, Math.max(1, opts?.maxResults ?? 10));
  const resp = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: key,
      query,
      search_depth: "basic",
      include_answer: false,
      include_images: false,
      include_raw_content: false,
      max_results: maxResults,
    }),
  });

  const body = (await resp.json().catch(() => null)) as {
    results?: Array<{ title?: string; url?: string; content?: string; snippet?: string }>;
    detail?: { error?: string } | string;
    error?: string;
  } | null;

  if (!resp.ok) {
    const msg =
      (typeof body?.detail === "object" ? body.detail?.error : body?.detail) ||
      body?.error ||
      `Tavily HTTP ${resp.status}`;
    throw new TavilyError(String(msg), resp.status === 429 ? 429 : 502);
  }

  const rows = body?.results ?? [];
  return rows
    .map((r) => ({
      title: (r.title ?? "").trim(),
      url: (r.url ?? "").trim(),
      snippet: (r.content ?? r.snippet ?? "").trim(),
    }))
    .filter((r) => r.url.length > 0);
}
