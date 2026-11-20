/**
 * Live distributor catalog pulls (Lipsey's / Chattanooga / 2AW) into catalog_items.
 */

import { syncChattanoogaCatalog } from "@/lib/chattanooga/sync";
import { errorMessage } from "@/lib/api-error";
import { syncLipseysCatalog } from "@/lib/lipseys/sync";
import { syncTawCatalog } from "@/lib/taw/feed";
import type { ImportResult } from "@/lib/csv/importer";
import { type ApiSyncVendor } from "@/lib/tracked-vendors";

export interface CatalogRefreshResult {
  vendor: ApiSyncVendor;
  ok: boolean;
  parsed?: number;
  upserted?: number;
  error?: string;
}

export async function syncApiCatalog(vendor: ApiSyncVendor): Promise<ImportResult> {
  if (vendor === "lipseys") return syncLipseysCatalog();
  if (vendor === "chattanooga") return syncChattanoogaCatalog();
  return syncTawCatalog();
}

/** Pull live feeds in parallel. Failures are returned per vendor, not thrown. */
export async function refreshApiCatalogs(vendors: readonly ApiSyncVendor[]): Promise<CatalogRefreshResult[]> {
  return Promise.all(
    vendors.map(async (vendor): Promise<CatalogRefreshResult> => {
      try {
        const result = await syncApiCatalog(vendor);
        return {
          vendor,
          ok: true,
          parsed: result.parsed,
          upserted: result.upserted,
        };
      } catch (err) {
        return { vendor, ok: false, error: errorMessage(err) };
      }
    }),
  );
}
