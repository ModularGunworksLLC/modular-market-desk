/** Server-only read queries for the import dashboard. */

import "server-only";

import { desc, eq, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { catalogItems, connections, csvPresets, type CsvPreset } from "@/lib/db/schema";
import { DEFAULT_PRESETS } from "@/lib/csv/presets";

export interface CatalogSummary {
  vendorName: string;
  items: number;
  inStock: number;
  onSale: number;
  lastImport: string | null;
  cheapest: number | null;
}

export async function getCatalogSummaries(): Promise<CatalogSummary[]> {
  const rows = await db
    .select({
      vendorName: catalogItems.vendorName,
      items: sql<number>`count(*)::int`,
      inStock: sql<number>`sum(case when ${catalogItems.inStock} then 1 else 0 end)::int`,
      onSale: sql<number>`sum(case when ${catalogItems.onSale} then 1 else 0 end)::int`,
      lastImport: sql<string | null>`max(${catalogItems.importedAt})`,
      cheapest: sql<number | null>`min(${catalogItems.dealerPrice})::float8`,
    })
    .from(catalogItems)
    .groupBy(catalogItems.vendorName)
    .orderBy(catalogItems.vendorName);
  return rows;
}

export async function listPresets(): Promise<CsvPreset[]> {
  return db.select().from(csvPresets).orderBy(csvPresets.vendorName);
}

/** Resolve a vendor's preset from the DB, falling back to the built-in default. */
export async function getPresetForVendor(
  vendorName: string,
): Promise<{ columnMap: CsvPreset["columnMap"]; delimiter: string } | null> {
  const rows = await db.select().from(csvPresets).where(eq(csvPresets.vendorName, vendorName)).limit(1);
  const row = rows[0];
  if (row) return { columnMap: row.columnMap, delimiter: row.delimiter };

  const fallback = DEFAULT_PRESETS.find((p) => p.vendorName === vendorName);
  if (fallback) return { columnMap: fallback.columnMap, delimiter: fallback.delimiter ?? "," };
  return null;
}

export interface ConnectionView {
  id: string;
  vendor: string;
  kind: "market_api" | "vendor_session";
  label: string;
  status: string;
  updatedAt: string;
  expiresAt: string | null;
}

/** List connections WITHOUT secrets - safe to render. */
export async function listConnections(): Promise<ConnectionView[]> {
  const rows = await db
    .select({
      id: connections.id,
      vendor: connections.vendor,
      kind: connections.kind,
      label: connections.label,
      status: connections.status,
      updatedAt: connections.updatedAt,
      expiresAt: connections.expiresAt,
    })
    .from(connections)
    .orderBy(desc(connections.updatedAt));
  return rows.map((r) => ({
    ...r,
    updatedAt: r.updatedAt.toISOString(),
    expiresAt: r.expiresAt ? r.expiresAt.toISOString() : null,
  }));
}
