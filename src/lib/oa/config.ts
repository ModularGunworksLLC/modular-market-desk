/**
 * Origins and thresholds for the Connect OA handoff.
 * The bookmarklet hard-codes the Desk origin from here and will not post elsewhere.
 */

export const DEFAULT_DESK_ORIGIN = "https://desk.modulargunworks.com";
export const DEFAULT_OA_ORIGIN = "https://hub.outdooranalytics.com";
/** Confirmed in the public OA bundle via sessionStorage.getItem("gb_session_token"). */
export const DEFAULT_OA_SESSION_STORAGE_KEY = "gb_session_token";

export function deskPublicOrigin(): string {
  const raw = (process.env.DESK_PUBLIC_ORIGIN || process.env.PUBLIC_DESK_URL || DEFAULT_DESK_ORIGIN).trim();
  return normalizeOrigin(raw);
}

export function oaAllowedOrigins(): string[] {
  const raw = process.env.OA_ALLOWED_ORIGINS?.trim();
  const parts = raw
    ? raw.split(",").map((s) => s.trim()).filter(Boolean)
    : [DEFAULT_OA_ORIGIN];
  const out: string[] = [];
  for (const part of parts) {
    try {
      out.push(normalizeOrigin(part));
    } catch {
      /* skip an unparsable entry rather than widening the allow-list */
    }
  }
  return out.length > 0 ? out : [DEFAULT_OA_ORIGIN];
}

/**
 * Origins allowed to postMessage a token into the Desk connect window.
 * Loopback Desk origins are included so the local mock page can exercise the
 * handoff. Production (desk.modulargunworks.com) stays limited to OA.
 */
export function oaMessageOrigins(): string[] {
  const set = new Set<string>(oaAllowedOrigins());
  const desk = deskPublicOrigin();
  if (isLoopbackOrigin(desk)) set.add(desk);
  return [...set];
}

export function oaSessionStorageKey(): string {
  const raw = process.env.OA_SESSION_STORAGE_KEY?.trim();
  if (raw && /^[A-Za-z0-9_.:-]{1,80}$/.test(raw)) return raw;
  return DEFAULT_OA_SESSION_STORAGE_KEY;
}

export function oaExpiryWarnMs(): number {
  const raw = process.env.OA_EXPIRY_WARN_HOURS;
  if (raw == null || raw.trim() === "") return 2 * 3_600_000;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return 2 * 3_600_000;
  return n * 3_600_000;
}

export function isLoopbackOrigin(origin: string): boolean {
  try {
    const host = new URL(origin).hostname;
    return host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host === "::1";
  } catch {
    return false;
  }
}

export function normalizeOrigin(raw: string): string {
  const withScheme = raw.includes("://") ? raw : `https://${raw}`;
  const url = new URL(withScheme);
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("Origin must be http or https.");
  }
  if (url.protocol === "http:" && !isLoopbackHost(url.hostname)) {
    throw new Error("Only loopback origins may use http.");
  }
  return `${url.protocol}//${url.host}`;
}

function isLoopbackHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]" || hostname === "::1";
}
