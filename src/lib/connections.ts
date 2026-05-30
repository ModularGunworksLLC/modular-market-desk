/** Server-only helpers to read Session Vault secrets for outbound calls. */

import "server-only";

import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { connections } from "@/lib/db/schema";
import { decryptSecret } from "@/lib/vault";

/** Returns the decrypted GunBroker Analytics bearer token, or null if none is stored/active. */
export async function getMarketToken(vendor = "outdoor_analytics"): Promise<string | null> {
  const rows = await db
    .select()
    .from(connections)
    .where(and(eq(connections.vendor, vendor), eq(connections.kind, "market_api")))
    .limit(1);

  const row = rows[0];
  if (!row || row.status !== "active") return null;
  try {
    return decryptSecret(row.secret);
  } catch {
    return null;
  }
}
