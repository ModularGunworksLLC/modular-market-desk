/** Simple in-memory IP rate limit for long-lived Lightsail Node. */

type Bucket = { count: number; resetAt: number; audited: boolean };

const buckets = new Map<string, Bucket>();

/** `firstRejection` is true only on the first hit that crosses the limit in this window. */
export function rateLimitDecision(
  key: string,
  limit: number,
  windowMs: number,
): { ok: boolean; firstRejection: boolean } {
  const now = Date.now();
  const cur = buckets.get(key);
  if (!cur || now >= cur.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs, audited: false });
    return { ok: true, firstRejection: false };
  }
  if (cur.count >= limit) {
    const firstRejection = !cur.audited;
    cur.audited = true;
    return { ok: false, firstRejection };
  }
  cur.count += 1;
  return { ok: true, firstRejection: false };
}

export function rateLimitOk(key: string, limit: number, windowMs: number): boolean {
  return rateLimitDecision(key, limit, windowMs).ok;
}

/** Best-effort client IP behind Apache/proxy. */
export function clientIp(headers: Headers): string {
  const xf = headers.get("x-forwarded-for");
  if (xf) {
    const first = xf.split(",")[0]?.trim();
    if (first) return first;
  }
  return headers.get("x-real-ip")?.trim() || "unknown";
}
