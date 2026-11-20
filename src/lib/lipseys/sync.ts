/**
 * Pull Lipsey's dealer catalog via REST CatalogFeed and upsert into catalog_items.
 * Credentials: LIPSEYS_EMAIL / LIPSEYS_PASSWORD, or Session Vault (vendor=lipseys).
 */

import { upsertCatalogItems, type ImportResult } from "@/lib/csv/importer";
import type { NewCatalogItem } from "@/lib/db/schema";

import { LipseysApiClient, LipseysApiError, mapLipseysCatalogItem } from "./client";

export { LipseysApiError };

const VENDOR = "lipseys";

export interface LipseysCredentials {
  email: string;
  password: string;
  source: "vault" | "env";
}

/** Resolve email + password from env first (CLI / Lightsail), then Session Vault. */
export async function resolveLipseysCredentials(): Promise<LipseysCredentials | null> {
  const envEmail = (process.env.LIPSEYS_EMAIL ?? "").trim();
  const envPassword = (process.env.LIPSEYS_PASSWORD ?? "").trim();
  if (envEmail && envPassword) {
    return { email: envEmail, password: envPassword, source: "env" };
  }

  const { getVendorApiConnection } = await import("@/lib/connections");
  const conn = await getVendorApiConnection(VENDOR, "market_api");
  const vaultPassword = conn?.token?.trim() ?? "";
  const vaultEmail = typeof conn?.meta.email === "string" ? conn.meta.email.trim() : "";

  if (vaultEmail && vaultPassword) {
    return { email: vaultEmail, password: vaultPassword, source: "vault" };
  }
  if (vaultPassword && envEmail) return { email: envEmail, password: vaultPassword, source: "vault" };
  if (vaultEmail && envPassword) return { email: vaultEmail, password: envPassword, source: "vault" };

  return null;
}

function slug(...parts: (string | null | undefined)[]): string {
  return parts
    .filter(Boolean)
    .join("|")
    .toLowerCase()
    .replace(/[^0-9a-z]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export async function syncLipseysCatalog(): Promise<ImportResult> {
  const creds = await resolveLipseysCredentials();
  if (!creds) {
    throw new LipseysApiError(
      "Missing Lipsey's API credentials. Vault: vendor=lipseys, kind=market_api, email in the Email field, password as the secret — or set LIPSEYS_EMAIL and LIPSEYS_PASSWORD in .env.",
      409,
    );
  }

  const client = new LipseysApiClient({ email: creds.email, password: creds.password });
  const rawItems = await client.fetchCatalogFeed();

  const now = new Date();
  const batch: NewCatalogItem[] = [];
  let skipped = 0;

  for (const raw of rawItems) {
    const mapped = mapLipseysCatalogItem(raw);
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
      salePrice: mapped.salePrice,
      onSale: mapped.onSale,
      qty: mapped.qty,
      inStock: mapped.inStock,
      sourceFile: `lipseys-api:${creds.source}`,
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
