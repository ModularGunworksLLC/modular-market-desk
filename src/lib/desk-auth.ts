/**
 * Desk access gate — shared-secret cookie / Authorization header.
 * When DESK_AUTH_SECRET is unset/empty, auth is disabled (local dev).
 */

import { createHmac, timingSafeEqual } from "node:crypto";

export const DESK_AUTH_COOKIE = "desk_session";

export function deskAuthSecret(): string | null {
  const raw = process.env.DESK_AUTH_SECRET?.trim();
  return raw ? raw : null;
}

export function deskAuthEnabled(): boolean {
  return deskAuthSecret() != null;
}

/** HMAC session token derived from the shared secret (not the raw secret in the cookie). */
export function mintDeskSessionToken(secret: string): string {
  return createHmac("sha256", secret).update("modular-market-desk-v1").digest("hex");
}

export function sessionTokenValid(token: string | undefined | null, secret: string): boolean {
  if (!token) return false;
  const expected = mintDeskSessionToken(secret);
  try {
    const a = Buffer.from(token);
    const b = Buffer.from(expected);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/** Accept cookie session OR `Authorization: Bearer <DESK_AUTH_SECRET>` (for scripts). */
export function authorizeDeskRequest(opts: {
  cookieToken?: string | null;
  authorizationHeader?: string | null;
}): boolean {
  const secret = deskAuthSecret();
  if (!secret) return true;

  if (sessionTokenValid(opts.cookieToken, secret)) return true;

  const auth = opts.authorizationHeader?.trim() ?? "";
  if (auth.toLowerCase().startsWith("bearer ")) {
    const presented = auth.slice(7).trim();
    try {
      const a = Buffer.from(presented);
      const b = Buffer.from(secret);
      if (a.length === b.length && timingSafeEqual(a, b)) return true;
    } catch {
      /* fall through */
    }
  }
  return false;
}
