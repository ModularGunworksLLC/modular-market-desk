/**
 * UPSERT structured catalog rows and mark SKUs absent from this sync as OOS.
 * Keeps the same (vendor_name, dedupe_key) contract as the CSV importer.
 */

import "server-only";

import { and, eq, lt, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { catalogItems, type NewCatalogItem } from "@/lib/db/schema";

import { dedupeKeyForRow, normalizeCatalogRow } from "./rows";
import type { CatalogRow } from "./types";

const BATCH_SIZE = 500;

export interface RowImportResult {
  vendorName: string;
  parsed: number;
  upserted: number;
  skipped: number;
  markedOutOfStock: number;
}

function toNewItem(
  row: CatalogRow,
  ctx: { vendorName: string; sourceFile: string; now: Date },
): NewCatalogItem {
  return {
    vendorName: ctx.vendorName,
    dedupeKey: dedupeKeyForRow(row),
    sku: row.sku,
    upc: row.upc,
    manufacturer: row.manufacturer,
    model: row.model,
    caliber: row.caliber,
    category: row.category,
    description: row.description,
    dealerPrice: row.dealerPrice,
    msrp: row.msrp,
    mapPrice: row.mapPrice,
    salePrice: row.salePrice,
    onSale: row.onSale,
    qty: row.qty,
    inStock: row.qty == null ? true : row.qty > 0,
    sourceFile: ctx.sourceFile,
    importedAt: ctx.now,
    updatedAt: ctx.now,
  };
}

function sqlExcluded(column: string) {
  return sql.raw(`excluded.${column}`);
}

async function flush(batch: NewCatalogItem[]): Promise<number> {
  if (batch.length === 0) return 0;
  await db
    .insert(catalogItems)
    .values(batch)
    .onConflictDoUpdate({
      target: [catalogItems.vendorName, catalogItems.dedupeKey],
      set: {
        sku: sqlExcluded("sku"),
        upc: sqlExcluded("upc"),
        manufacturer: sqlExcluded("manufacturer"),
        model: sqlExcluded("model"),
        caliber: sqlExcluded("caliber"),
        category: sqlExcluded("category"),
        description: sqlExcluded("description"),
        dealerPrice: sqlExcluded("dealer_price"),
        msrp: sqlExcluded("msrp"),
        mapPrice: sqlExcluded("map_price"),
        salePrice: sqlExcluded("sale_price"),
        onSale: sqlExcluded("on_sale"),
        qty: sqlExcluded("qty"),
        inStock: sqlExcluded("in_stock"),
        sourceFile: sqlExcluded("source_file"),
        importedAt: sqlExcluded("imported_at"),
        updatedAt: sqlExcluded("updated_at"),
      },
    });
  return batch.length;
}

/**
 * Mark catalog rows for this vendor that were not touched in the current sync
 * as out of stock. Prevents ghost "still available" SKUs after a full feed pull.
 */
export async function markMissingOutOfStock(
  vendorName: string,
  syncStartedAt: Date,
): Promise<number> {
  const result = await db
    .update(catalogItems)
    .set({
      inStock: false,
      qty: 0,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(catalogItems.vendorName, vendorName),
        eq(catalogItems.inStock, true),
        lt(catalogItems.updatedAt, syncStartedAt),
      ),
    )
    .returning({ id: catalogItems.id });
  return result.length;
}

/** UPSERT already-normalized rows. */
export async function importCatalogRows(
  rows: CatalogRow[],
  opts: { vendorName: string; sourceFile: string; markStale?: boolean; syncStartedAt?: Date },
): Promise<RowImportResult> {
  const now = opts.syncStartedAt ?? new Date();
  const result: RowImportResult = {
    vendorName: opts.vendorName,
    parsed: rows.length,
    upserted: 0,
    skipped: 0,
    markedOutOfStock: 0,
  };

  let batch: NewCatalogItem[] = [];
  for (const row of rows) {
    batch.push(toNewItem(row, { vendorName: opts.vendorName, sourceFile: opts.sourceFile, now }));
    if (batch.length >= BATCH_SIZE) {
      result.upserted += await flush(batch);
      batch = [];
    }
  }
  result.upserted += await flush(batch);

  if (opts.markStale !== false && result.upserted > 0) {
    result.markedOutOfStock = await markMissingOutOfStock(opts.vendorName, now);
  }

  return result;
}

/** Normalize loose records then UPSERT. */
export async function importRawCatalogRecords(
  records: Record<string, unknown>[],
  opts: { vendorName: string; sourceFile: string; markStale?: boolean; syncStartedAt?: Date },
): Promise<RowImportResult> {
  const rows: CatalogRow[] = [];
  let skipped = 0;
  for (const raw of records) {
    const row = normalizeCatalogRow(raw);
    if (!row) {
      skipped += 1;
      continue;
    }
    rows.push(row);
  }
  const result = await importCatalogRows(rows, opts);
  result.parsed = records.length;
  result.skipped += skipped;
  return result;
}
