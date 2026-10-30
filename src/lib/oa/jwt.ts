/**
 * Read a JWT `exp` claim without verifying the signature.
 * Outdoor Analytics session tokens are opaque to Desk; we only need the expiry
 * instant the portal already put in the payload. Malformed input returns null.
 */

export function decodeJwtExp(token: string): Date | null {
  try {
    const parts = token.split(".");
    if (parts.length < 2) return null;
    const payloadSeg = parts[1];
    if (!payloadSeg || !/^[A-Za-z0-9_-]+$/.test(payloadSeg)) return null;
    const payload = decodeBase64UrlJson(payloadSeg);
    if (!payload || typeof payload !== "object") return null;
    const exp = (payload as { exp?: unknown }).exp;
    if (typeof exp !== "number" || !Number.isFinite(exp)) return null;
    // JWT exp is seconds since epoch. Reject millisecond-sized or negative values.
    if (exp <= 0 || exp > 10_000_000_000) return null;
    return new Date(exp * 1000);
  } catch {
    return null;
  }
}

function decodeBase64UrlJson(segment: string): unknown {
  const pad = segment.length % 4 === 0 ? "" : "=".repeat(4 - (segment.length % 4));
  const b64 = segment.replace(/-/g, "+").replace(/_/g, "/") + pad;
  const json = Buffer.from(b64, "base64").toString("utf8");
  return JSON.parse(json) as unknown;
}
