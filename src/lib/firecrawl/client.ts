/**
 * Firecrawl client for authenticated dealer-portal catalog pulls.
 * Secrets never leave the Lightsail process — Cookie / Token headers are built
 * from the Session Vault and passed only to Firecrawl / vendor endpoints.
 */

import "server-only";

import { Firecrawl } from "firecrawl";

export class FirecrawlConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FirecrawlConfigError";
  }
}

export function getFirecrawlApiKey(): string {
  const fromEnv = (process.env.FIRECRAWL_API_KEY ?? "").trim();
  if (fromEnv) return fromEnv;
  throw new FirecrawlConfigError(
    "Missing FIRECRAWL_API_KEY. Set it in server .env (same key used for firecrawl init).",
  );
}

export function createFirecrawlClient(apiKey = getFirecrawlApiKey()): Firecrawl {
  const apiUrl = (process.env.FIRECRAWL_API_URL ?? "").trim() || undefined;
  return new Firecrawl({ apiKey, ...(apiUrl ? { apiUrl } : {}) });
}
