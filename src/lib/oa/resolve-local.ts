/**
 * Resolve free-text make/model/caliber against synced oa_catalog (no live OA call).
 */

import { createClient } from "@libsql/client";

import {
  resolveQueryAttempts,
  resolveSelection,
  type GbaQuery,
  type OaDependencies,
  type OaManufacturerNode,
  type OaSelection,
} from "@/lib/gba/scorer";
import { ensureOaCatalogTables } from "@/lib/oa/sync-catalog";

function databaseUrl(): string {
  return process.env.DATABASE_URL ?? "file:./data/desk.db";
}

async function loadDeps(): Promise<OaDependencies> {
  await ensureOaCatalogTables();
  const client = createClient({ url: databaseUrl() });
  try {
    const cat = await client.execute(
      "SELECT condition, manufacturer_id, manufacturer, is_common, model_id, model, caliber_id, caliber FROM oa_catalog",
    );
    const buckets: Record<string, Map<number, OaManufacturerNode>> = {
      NEW: new Map(),
      USED: new Map(),
    };
    for (const row of cat.rows) {
      const condition = String(row.condition ?? "USED").toUpperCase();
      const bucket = buckets[condition] ?? buckets.USED!;
      const mfrId = Number(row.manufacturer_id);
      const modelId = Number(row.model_id);
      const caliberId = Number(row.caliber_id);
      if (!mfrId || !modelId) continue;
      let mfr = bucket.get(mfrId);
      if (!mfr) {
        mfr = {
          Manufacturer: String(row.manufacturer ?? ""),
          ManufacturerID: mfrId,
          IsCommonManufacturer: Boolean(row.is_common),
          Models: [],
        };
        bucket.set(mfrId, mfr);
      }
      let model = (mfr.Models ?? []).find((x) => Number(x.ModelID) === modelId);
      if (!model) {
        model = { Model: String(row.model ?? ""), ModelID: modelId, Calibers: [] };
        mfr.Models = [...(mfr.Models ?? []), model];
      }
      if (caliberId > 0) {
        const exists = (model.Calibers ?? []).some((c) => Number(c.CaliberID) === caliberId);
        if (!exists) {
          model.Calibers = [
            ...(model.Calibers ?? []),
            { Caliber: String(row.caliber ?? ""), CaliberID: caliberId },
          ];
        }
      }
    }
    return {
      NEW: [...(buckets.NEW?.values() ?? [])],
      USED: [...(buckets.USED?.values() ?? [])],
    };
  } finally {
    client.close();
  }
}

let depsCache: { at: number; deps: OaDependencies } | null = null;
const DEPS_TTL_MS = 10 * 60 * 1000;

export async function loadDepsAndResolve(query: GbaQuery): Promise<OaSelection | null> {
  const now = Date.now();
  if (!depsCache || now - depsCache.at > DEPS_TTL_MS) {
    depsCache = { at: now, deps: await loadDeps() };
  }
  for (const attempt of resolveQueryAttempts(query)) {
    const hit = resolveSelection(depsCache.deps, attempt);
    if (hit) return hit;
  }
  return null;
}
