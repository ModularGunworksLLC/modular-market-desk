/**
 * Pull Chattanooga dealer catalog via REST API and upsert into catalog_items.
 * Credentials: Session Vault (vendor=chattanooga) or CHATTANOOGA_API_SID / CHATTANOOGA_API_TOKEN env.
 */

import "server-only";

import { getVendorApiConnection } from "@/lib/connections";
import { upsertCatalogItems, type ImportResult } from "@/lib/csv/importer";
import type { NewCatalogItem } from "@/lib/db/schema";

import { ChattanoogaApiClient, ChattanoogaApiError, mapChattanoogaItem } from "./client";

export { ChattanoogaApiError };

const VENDOR = "chattanooga";

export interface ChattanoogaCredentials {
  sid: string;
  token: string;
  source: "vault" | "env";
}

/** Resolve SID + token from vault meta/secret, with env fallbacks (incl. website API_SID/API_TOKEN). */
export async function resolveChattanoogaCredentials(): Promise<ChattanoogaCredentials | null> {
  const conn = await getVendorApiConnection(VENDOR, "market_api");
  const vaultToken = conn?.token?.trim() ?? "";
  const vaultSid =
    (typeof conn?.meta.apiSid === "string" ? conn.meta.apiSid.trim() : "") ||
    (typeof conn?.meta.sid === "string" ? conn.meta.sid.trim() : "");

  if (vaultSid && vaultToken) {
    return { sid: vaultSid, token: vaultToken, source: "vault" };
  }

  const envSid = (process.env.CHATTANOOGA_API_SID ?? process.env.API_SID ?? "").trim();
  const envToken = (process.env.CHATTANOOGA_API_TOKEN ?? process.env.API_TOKEN ?? "").trim();
  if (envSid && envToken) {
    return { sid: envSid, token: envToken, source: "env" };
  }

  // Partial vault: token only + env SID (or vice versa)
  if (vaultToken && envSid) return { sid: envSid, token: vaultToken, source: "vault" };
  if (vaultSid && envToken) return { sid: vaultSid, token: envToken, source: "vault" };

  return null;
}

function slug(...parts: (string | null | undefined)[]): string {
  return parts
    .filter(Boolean)
    .join("|")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export async function syncChattanoogaCatalog(): Promise<ImportResult> {
  const creds = await resolveChattanoogaCredentials();
  if (!creds) {
    throw new ChattanoogaApiError(
      "Missing Chattanooga API credentials. Vault: vendor=chattanooga, kind=market_api, secret=API_TOKEN, plus API SID in the SID field — or set CHATTANOOGA_API_SID and CHATTANOOGA_API_TOKEN in .env.",
      409,
    );
  }

  const client = new ChattanoogaApiClient({ sid: creds.sid, token: creds.token });
  const rawItems = await client.fetchAllItems();

  const now = new Date();
  const batch: NewCatalogItem[] = [];
  let skipped = 0;

  for (const raw of rawItems) {
    if (raw.discontinued === 1 || raw.discontinued === true || raw.discontinued === "Y") {
      skipped += 1;
      continue;
    }
    const mapped = mapChattanoogaItem(raw);
    if (!mapped) {
      skipped += 1;
      continue;
    }
    const dedupeKey = mapped.upc ?? mapped.sku ?? slug(mapped.manufacturer, mapped.model, mapped.description);
    batch.push({
      vendorName: VENDOR,
      dedupeKey,
      sku: mapped.sku,
      upc: mapped.upc,
      manufacturer: mapped.manufacturer,
      model: mapped.model,
      caliber: mapped.caliber,
      category: mapped.category,
      description: mapped.description,
      dealerPrice: mapped.dealerPrice,
      msrp: mapped.msrp,
      mapPrice: mapped.mapPrice,
      salePrice: null,
      onSale: false,
      qty: mapped.qty,
      inStock: mapped.inStock,
      sourceFile: `chattanooga-api:${creds.source}`,
      importedAt: now,
      updatedAt: now,
    });
  }

  const upserted = await upsertCatalogItems(batch);
  return {
    vendorName: VENDOR,
    parsed: rawItems.length,
    upserted,
    skipped,
  };
}
