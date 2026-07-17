/**
 * Memory-safe bulk CSV importer.
 *
 * Streams a (potentially multi-megabyte) distributor CSV with `csv-parse`, never buffering the
 * whole file. Rows are mapped onto unified catalog columns via a `csv_presets` column map, then
 * flushed to SQLite in batches of 500 using a Drizzle UPSERT keyed on (vendor_name, dedupe_key).
 * Re-importing the same file is idempotent.
 *
 * 500 rows x ~18 columns = ~9k bound params per statement, comfortably under libsql's
 * SQLITE_MAX_VARIABLE_NUMBER (32766).
 */

import { parse } from "csv-parse";
import { sql } from "drizzle-orm";
import { Readable } from "node:stream";
import type { Readable as ReadableStream } from "node:stream";

import { round2 } from "@/lib/arbitrage/fees";
import { db } from "@/lib/db";
import { catalogItems, type CsvColumnMap, type NewCatalogItem } from "@/lib/db/schema";

import { detectDelimiter } from "./delimiter";

const BATCH_SIZE = 500;

export interface ImportResult {
  vendorName: string;
  parsed: number;
  upserted: number;
  skipped: number;
  /** Present when every row was skipped — helps fix header/delimiter presets. */
  debug?: {
    detectedDelimiter: string;
    columnCount: number;
    resolvedColumns: Partial<Record<keyof CsvColumnMap, string>>;
    missingPriceColumn: boolean;
  };
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

/**
 * Parse a single price cell. Takes the first currency-like number so ranges
 * like "$12.99-$15" become 12.99 (not 12.9915 from naive digit-stripping).
 */
function parseMoney(value: string | undefined): number | null {
  if (!value) return null;
  const m = value.replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isFinite(n) && n >= 0 ? n : null;
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
  // Prefer explicit manufacturer; never invent from the first word of a description.
  const manufacturer = (cell("manufacturer") || "").trim() || "Unknown";
  const model = (cell("model") || "").trim() || description;
  const dealerPrice =
    parseMoney(cell("dealerPrice")) ??
    parseMoney(cell("salePrice")) ??
    parseMoney(cell("mapPrice")) ??
    parseMoney(cell("msrp"));
  if (dealerPrice == null) return null; // no usable price -> skip
  if (!model && !description) return null;

  let upc = cell("upc") || null;
  if (upc) upc = upc.replace(/^#+|#+$/g, "").trim() || null;
  const sku = cell("sku") || null;
  const dedupeKey = upc ?? sku ?? slug(manufacturer, model, description);

  const salePrice = parseMoney(cell("salePrice"));
  const msrp = parseMoney(cell("msrp"));
  const qty = parseQty(cell("qty"));
  const onSale =
    /^(y|yes|true|1|sale|on sale)$/i.test(cell("onSale") ?? "") ||
    (salePrice != null && salePrice > 0 && salePrice < dealerPrice) ||
    (msrp != null && msrp > dealerPrice);

  // SQLite real columns expect numbers; round to cents at the write boundary.
  const money = (n: number | null | undefined): number | null =>
    n == null ? null : round2(n);

  const effectiveDealer =
    salePrice != null && salePrice > 0 && salePrice < dealerPrice ? salePrice : dealerPrice;

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
    dealerPrice: money(effectiveDealer)!,
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

/** Batched UPSERT for pre-built catalog rows (API syncs, etc.). */
export async function upsertCatalogItems(items: NewCatalogItem[]): Promise<number> {
  let upserted = 0;
  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    upserted += await flush(items.slice(i, i + BATCH_SIZE));
  }
  return upserted;
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

/** Read through the first line so we can sniff tab vs comma before parsing the rest. */
async function streamWithFirstLine(
  stream: ReadableStream,
): Promise<{ combined: Readable; firstLine: string }> {
  const reader = stream[Symbol.asyncIterator]();
  let buffer = "";
  const prefix: Buffer[] = [];

  while (buffer.length < 65536 && !buffer.includes("\n")) {
    const { value, done } = await reader.next();
    if (done) break;
    const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value);
    prefix.push(chunk);
    buffer += chunk.toString("utf8");
  }

  const firstLine = buffer.split(/\r?\n/)[0] ?? "";

  async function* rest(): AsyncGenerator<Buffer> {
    for (const chunk of prefix) yield chunk;
    while (true) {
      const { value, done } = await reader.next();
      if (done) break;
      yield Buffer.isBuffer(value) ? value : Buffer.from(value);
    }
  }

  return { combined: Readable.from(rest()), firstLine };
}

export async function importCatalogCsv(
  stream: ReadableStream,
  opts: { vendorName: string; columnMap: CsvColumnMap; delimiter?: string; sourceFile: string },
): Promise<ImportResult> {
  const now = new Date();
  const result: ImportResult = { vendorName: opts.vendorName, parsed: 0, upserted: 0, skipped: 0 };

  const { combined, firstLine } = await streamWithFirstLine(stream);
  const sniffed = detectDelimiter(firstLine);
  const delimiter = opts.delimiter?.trim() || sniffed || ",";

  const parser = combined.pipe(
    parse({
      columns: true,
      bom: true,
      delimiter,
      relax_column_count: true,
      skip_empty_lines: true,
      trim: true,
    }),
  );

  let resolved: Partial<Record<keyof CsvColumnMap, string>> | null = null;
  let columnCount = 0;
  let batch: NewCatalogItem[] = [];

  for await (const record of parser as AsyncIterable<Record<string, string>>) {
    if (!resolved) {
      const keys = Object.keys(record);
      columnCount = keys.length;
      resolved = resolveHeaders(keys, opts.columnMap);
    }
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

  if (result.parsed > 0 && result.upserted === 0) {
    const resolvedColumns = resolved ?? {};
    result.debug = {
      detectedDelimiter: delimiter === "\t" ? "tab" : delimiter,
      columnCount,
      resolvedColumns,
      missingPriceColumn: !resolvedColumns.dealerPrice && !resolvedColumns.msrp && !resolvedColumns.mapPrice,
    };
  }

  return result;
}
