/**
 * Desk access gate — shared-secret cookie / Authorization header.
 * When DESK_AUTH_SECRET is unset/empty, auth is disabled (local dev).
 *
 * Uses Web Crypto only so this module is safe in Edge middleware and Node.
 */

export const DESK_AUTH_COOKIE = "desk_session";
const SESSION_MSG = "modular-market-desk-v1";

export function deskAuthSecret(): string | null {
  const raw = process.env.DESK_AUTH_SECRET?.trim();
  return raw ? raw : null;
}

export function deskAuthEnabled(): boolean {
  return deskAuthSecret() != null;
}

function toHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function hmacHex(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return toHex(sig);
}

/** HMAC session token derived from the shared secret (not the raw secret in the cookie). */
export async function mintDeskSessionToken(secret: string): Promise<string> {
  return hmacHex(secret, SESSION_MSG);
}

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export async function sessionTokenValid(
  token: string | undefined | null,
  secret: string,
): Promise<boolean> {
  if (!token) return false;
  const expected = await mintDeskSessionToken(secret);
  return timingSafeEqualHex(token, expected);
}

function secretsMatch(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/** Accept cookie session OR `Authorization: Bearer <DESK_AUTH_SECRET>` (for scripts). */
export async function authorizeDeskRequest(opts: {
  cookieToken?: string | null;
  authorizationHeader?: string | null;
}): Promise<boolean> {
  const secret = deskAuthSecret();
  if (!secret) return true;

  if (await sessionTokenValid(opts.cookieToken, secret)) return true;

  const auth = opts.authorizationHeader?.trim() ?? "";
  if (auth.toLowerCase().startsWith("bearer ")) {
    const presented = auth.slice(7).trim();
    if (secretsMatch(presented, secret)) return true;
  }
  return false;
}
