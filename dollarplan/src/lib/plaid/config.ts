/**
 * Plaid integration surface — not wired until PLAID_CLIENT_ID is set.
 * Schema tables `plaid_items` / `plaid_accounts` are ready; transactions use
 * `source: 'plaid'` and `plaidTransactionId` for dedupe.
 */

export type PlaidEnv = "sandbox" | "development" | "production";

export function isPlaidEnabled(): boolean {
  return Boolean(process.env.PLAID_CLIENT_ID && process.env.PLAID_SECRET);
}

export function plaidEnv(): PlaidEnv {
  const env = process.env.PLAID_ENV ?? "sandbox";
  if (env === "sandbox" || env === "development" || env === "production") return env;
  return "sandbox";
}

/** Throws if Plaid is not configured — call from future /api/plaid/* routes only. */
export function assertPlaidConfigured(): void {
  if (!isPlaidEnabled()) {
    throw new Error(
      "Plaid is not configured. Set PLAID_CLIENT_ID and PLAID_SECRET in .env to enable bank sync.",
    );
  }
}
