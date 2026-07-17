/**
 * Session Vault crypto - AES-256-GCM at rest for pasted bearer tokens / cookie strings.
 * Stored format: base64(iv).base64(authTag).base64(ciphertext). Never log plaintext.
 */

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGO = "aes-256-gcm";
const IV_LEN = 12;

function key(): Buffer {
  const raw = process.env.SESSION_VAULT_KEY;
  if (!raw) throw new Error("SESSION_VAULT_KEY is not set (base64, 32 bytes).");
  const buf = Buffer.from(raw, "base64");
  if (buf.length !== 32) throw new Error("SESSION_VAULT_KEY must decode to exactly 32 bytes.");
  return buf;
}

export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("base64"), tag.toString("base64"), enc.toString("base64")].join(".");
}

/** Strip DevTools noise (multi-line header copies, Bearer prefix) to a single JWT or cookie line. */
export function normalizeVaultSecret(secret: string): string {
  let s = secret.trim();
  s = s.replace(/^\s*Bearer\s+/i, "");
  s = (s.split(/\r?\n/)[0] ?? "").trim();
  const jwt = s.match(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/);
  if (jwt) return jwt[0];
  return s;
}

/** Remove bearer tokens / JWTs / long secrets from strings before surfacing to clients or logs. */
export function redactSecrets(text: string): string {
  return text
    .replace(/Bearer\s+[A-Za-z0-9._\-]+/gi, "Bearer [redacted]")
    .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "[redacted-jwt]")
    .replace(/(api[_-]?sid|api[_-]?token|session|cookie)\s*[:=]\s*["']?[^\s"',;]+/gi, "$1=[redacted]")
    .replace(/\b[A-Za-z0-9_-]{40,}\b/g, "[redacted-token]");
}

export function decryptSecret(payload: string): string {
  const [ivB64, tagB64, dataB64] = payload.split(".");
  if (!ivB64 || !tagB64 || !dataB64) throw new Error("Malformed vault payload.");
  const decipher = createDecipheriv(ALGO, key(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]).toString("utf8");
}
