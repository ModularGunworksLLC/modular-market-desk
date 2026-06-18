/** Server-only helpers to read Session Vault secrets for outbound calls. */

import "server-only";

import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { connections } from "@/lib/db/schema";
import { decryptSecret, normalizeVaultSecret } from "@/lib/vault";

export interface VendorApiConnection {
  token: string;
  meta: Record<string, unknown>;
  label: string;
}

/** Returns the decrypted bearer token for a vendor API connection, or null if none is stored/active. */
export async function getVendorApiConnection(
  vendor: string,
  kind: "market_api" | "vendor_session" = "market_api",
): Promise<VendorApiConnection | null> {
  const rows = await db
    .select()
    .from(connections)
    .where(and(eq(connections.vendor, vendor), eq(connections.kind, kind)))
    .limit(1);

  const row = rows[0];
  if (!row || row.status !== "active") return null;
  try {
    const token = normalizeVaultSecret(decryptSecret(row.secret));
    if (!token) return null;
    return {
      token,
      meta: (row.meta as Record<string, unknown>) ?? {},
      label: row.label,
    };
  } catch {
    return null;
  }
}

/** Returns the decrypted GunBroker Analytics bearer token, or null if none is stored/active. */
export async function getMarketToken(vendor = "outdoor_analytics"): Promise<string | null> {
  const conn = await getVendorApiConnection(vendor, "market_api");
  return conn?.token ?? null;
}
