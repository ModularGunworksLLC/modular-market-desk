/**
 * Fetch TGV HTML. Plain fetch is usually Cloudflare-blocked;
 * prefer Playwright when available, or TGV_COOKIE / cookie arg.
 */

import {
  isCloudflareChallengeHtml,
  isTgvNotFoundHtml,
} from "./parse";

export type TgvFetchResult =
  | { ok: true; html: string; status: number; via: "fetch" | "playwright" }
  | { ok: false; status: number; reason: "cf_blocked" | "not_found" | "error"; error: string; via: "fetch" | "playwright" };

const DEFAULT_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export async function fetchTgvHtml(
  url: string,
  opts?: { cookie?: string; timeoutMs?: number; usePlaywright?: boolean },
): Promise<TgvFetchResult> {
  const cookie = opts?.cookie?.trim() || process.env.TGV_COOKIE?.trim() || "";
  const timeoutMs = opts?.timeoutMs ?? 45_000;
  const preferPw = opts?.usePlaywright ?? process.env.TGV_USE_PLAYWRIGHT !== "0";

  if (preferPw) {
    const pw = await fetchViaPlaywright(url, { cookie, timeoutMs });
    if (pw) return pw;
  }

  return fetchViaHttp(url, { cookie, timeoutMs });
}

async function fetchViaHttp(
  url: string,
  opts: { cookie: string; timeoutMs: number },
): Promise<TgvFetchResult> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), opts.timeoutMs);
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: "follow",
      headers: {
        "User-Agent": DEFAULT_UA,
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
        ...(opts.cookie ? { Cookie: opts.cookie } : {}),
      },
    });
    clearTimeout(t);
    const html = await res.text();
    if (isCloudflareChallengeHtml(html) || res.status === 403) {
      return { ok: false, status: res.status, reason: "cf_blocked", error: "Cloudflare blocked", via: "fetch" };
    }
    if (isTgvNotFoundHtml(html, res.status)) {
      return { ok: false, status: res.status, reason: "not_found", error: "TGV page not found", via: "fetch" };
    }
    if (!res.ok) {
      return { ok: false, status: res.status, reason: "error", error: `HTTP ${res.status}`, via: "fetch" };
    }
    return { ok: true, html, status: res.status, via: "fetch" };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      reason: "error",
      error: err instanceof Error ? err.message : String(err),
      via: "fetch",
    };
  }
}

async function fetchViaPlaywright(
  url: string,
  opts: { cookie: string; timeoutMs: number },
): Promise<TgvFetchResult | null> {
  try {
    // Dynamic import so builds without playwright still typecheck when dep missing.
    const playwright = await import("playwright");
    const browser = await playwright.chromium.launch({ headless: true });
    try {
      const context = await browser.newContext({
        userAgent: DEFAULT_UA,
        viewport: { width: 1280, height: 900 },
      });
      if (opts.cookie) {
        const cookies = opts.cookie.split(";").map((part) => {
          const [name, ...rest] = part.trim().split("=");
          return {
            name: name!.trim(),
            value: rest.join("=").trim(),
            domain: ".truegunvalue.com",
            path: "/",
          };
        });
        await context.addCookies(cookies.filter((c) => c.name && c.value));
      }
      const page = await context.newPage();
      const res = await page.goto(url, { waitUntil: "domcontentloaded", timeout: opts.timeoutMs });
      const status = res?.status() ?? 0;
      await new Promise((r) => setTimeout(r, 800));
      const html = await page.content();
      if (isCloudflareChallengeHtml(html) || status === 403) {
        return { ok: false, status, reason: "cf_blocked", error: "Cloudflare blocked (playwright)", via: "playwright" };
      }
      if (isTgvNotFoundHtml(html, status)) {
        return { ok: false, status, reason: "not_found", error: "TGV page not found", via: "playwright" };
      }
      if (status >= 400) {
        return { ok: false, status, reason: "error", error: `HTTP ${status}`, via: "playwright" };
      }
      return { ok: true, html, status, via: "playwright" };
    } finally {
      await browser.close();
    }
  } catch {
    return null;
  }
}
