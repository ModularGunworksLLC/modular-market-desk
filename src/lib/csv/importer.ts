/**
 * Memory-safe bulk CSV importer.
 *
 * Streams a (potentially multi-megabyte) distributor CSV with `csv-parse`, never buffering the
 * whole file. Rows are mapped onto unified catalog columns via a `csv_presets` column map, then
 * flushed to Postgres in batches of 500 using a Drizzle UPSERT keyed on (vendor_name, dedupe_key).
 * Re-importing the same file is idempotent.
 */

import { parse } from "csv-parse";
import { sql } from "drizzle-orm";
import type { Readable } from "node:stream";

import { db } from "@/lib/db";
import { catalogItems, type CsvColumnMap, type NewCatalogItem } from "@/lib/db/schema";

const BATCH_SIZE = 500;

export interface ImportResult {
  vendorName: string;
  parsed: number;
  upserted: number;
  skipped: number;
}

/** Normalize a header for tolerant alias matching. */
function normHeader(h: string): string {
  return h.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

/** Build a map of unified field -> actual header present in this file. */
function resolveHeaders(headers: string[], columnMap: CsvColumnMap): Partial<Record<keyof CsvColumnMap, string>> {
  const byNorm = new Map<string, string>();
  for (const h of headers) byNorm.set(normHeader(h), h);

  const resolved: Partial<Record<keyof CsvColumnMap, string>> = {};
  for (const [field, aliases] of Object.entries(columnMap) as [keyof CsvColumnMap, string[]][]) {
    if (!aliases) continue;
    for (const alias of aliases) {
      const hit = byNorm.get(normHeader(alias));
      if (hit) {
        resolved[field] = hit;
        break;
      }
    }
  }
  return resolved;
}

function parseMoney(value: string | undefined): number | null {
  if (!value) return null;
  const cleaned = value.replace(/[^0-9.]/g, "");
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function parseQty(value: string | undefined): number | null {
  if (!value) return null;
  const cleaned = value.replace(/[^0-9]/g, "");
  return cleaned ? Number.parseInt(cleaned, 10) : null;
}

function slug(...parts: (string | null | undefined)[]): string {
  return parts
    .filter(Boolean)
    .join("|")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function rowToItem(
  row: Record<string, string>,
  resolved: Partial<Record<keyof CsvColumnMap, string>>,
  ctx: { vendorName: string; sourceFile: string; now: Date },
): NewCatalogItem | null {
  const cell = (field: keyof CsvColumnMap): string | undefined => {
    const header = resolved[field];
    return header ? row[header]?.trim() : undefined;
  };

  const description = cell("description") ?? "";
  const manufacturer = cell("manufacturer") ?? description.split(" ")[0] ?? "Unknown";
  const model = cell("model") ?? description;
  const dealerPrice = parseMoney(cell("dealerPrice")) ?? parseMoney(cell("msrp"));
  if (dealerPrice == null) return null; // no usable price -> skip
  if (!model && !description) return null;

  const upc = cell("upc") || null;
  const sku = cell("sku") || null;
  const dedupeKey = upc ?? sku ?? slug(manufacturer, model, description);

  const salePrice = parseMoney(cell("salePrice"));
  const msrp = parseMoney(cell("msrp"));
  const qty = parseQty(cell("qty"));
  const onSale =
    /^(y|yes|true|1|sale|on sale)$/i.test(cell("onSale") ?? "") ||
    (salePrice != null && salePrice > 0 && salePrice < dealerPrice) ||
    (msrp != null && msrp > dealerPrice);

  const money = (n: number | null | undefined): string | null => (n == null ? null : n.toFixed(2));

  return {
    vendorName: ctx.vendorName,
    dedupeKey,
    sku,
    upc,
    manufacturer: manufacturer || "Unknown",
    model: model || description,
    caliber: cell("caliber") || null,
    category: cell("category") || null,
    description: description || null,
    dealerPrice: (salePrice != null && salePrice > 0 && salePrice < dealerPrice
      ? salePrice
      : dealerPrice
    ).toFixed(2),
    msrp: money(msrp),
    mapPrice: money(parseMoney(cell("mapPrice"))),
    salePrice: money(salePrice),
    onSale,
    qty,
    inStock: qty == null ? true : qty > 0,
    sourceFile: ctx.sourceFile,
    importedAt: ctx.now,
    updatedAt: ctx.now,
  };
}

/** Batched UPSERT: overwrite pricing/stock for an existing (vendor_name, dedupe_key). */
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
        updatedAt: sqlExcluded("updated_at"),
      },
    });
  return batch.length;
}

/** Reference the would-be-inserted value inside an ON CONFLICT DO UPDATE. */
function sqlExcluded(column: string) {
  return sql.raw(`excluded.${column}`);
}

export async function importCatalogCsv(
  stream: Readable,
  opts: { vendorName: string; columnMap: CsvColumnMap; delimiter?: string; sourceFile: string },
): Promise<ImportResult> {
  const now = new Date();
  const result: ImportResult = { vendorName: opts.vendorName, parsed: 0, upserted: 0, skipped: 0 };

  const parser = stream.pipe(
    parse({
      columns: true,
      bom: true,
      delimiter: opts.delimiter ?? ",",
      relax_column_count: true,
      skip_empty_lines: true,
      trim: true,
    }),
  );

  let resolved: Partial<Record<keyof CsvColumnMap, string>> | null = null;
  let batch: NewCatalogItem[] = [];

  for await (const record of parser as AsyncIterable<Record<string, string>>) {
    if (!resolved) resolved = resolveHeaders(Object.keys(record), opts.columnMap);
    result.parsed += 1;

    const item = rowToItem(record, resolved, {
      vendorName: opts.vendorName,
      sourceFile: opts.sourceFile,
      now,
    });
    if (!item) {
      result.skipped += 1;
      continue;
    }
    batch.push(item);

    if (batch.length >= BATCH_SIZE) {
      result.upserted += await flush(batch);
      batch = [];
    }
  }

  result.upserted += await flush(batch);
  return result;
}
