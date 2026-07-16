/**
 * Flatten Outdoor Analytics /pricing/dependencies into DB-ready catalog rows.
 */

import { randomUUID } from "node:crypto";

import type { OaDependencies, OaManufacturerNode } from "@/lib/gba/scorer";

export type OaCatalogFlatRow = {
  id: string;
  condition: string;
  manufacturerId: number;
  manufacturer: string;
  isCommon: boolean;
  modelId: number;
  model: string;
  caliberId: number;
  caliber: string;
  syncedAt: Date;
};

function toInt(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

/** Flatten NEW/USED manufacturer trees into one row per model×caliber. */
export function flattenDependencies(deps: OaDependencies, syncedAt: Date): OaCatalogFlatRow[] {
  const out: OaCatalogFlatRow[] = [];
  const seen = new Set<string>();

  for (const condition of ["NEW", "USED"] as const) {
    const mfrs = deps[condition];
    if (!Array.isArray(mfrs)) continue;
    for (const mfr of mfrs as OaManufacturerNode[]) {
      const manufacturerId = toInt(mfr.ManufacturerID);
      const manufacturer = String(mfr.Manufacturer ?? "").trim();
      if (!manufacturerId || !manufacturer) continue;
      const isCommon = Boolean(mfr.IsCommonManufacturer);
      for (const model of mfr.Models ?? []) {
        const modelId = toInt(model.ModelID);
        const modelName = String(model.Model ?? "").trim();
        if (!modelId || !modelName) continue;
        const calibers = model.Calibers ?? [];
        if (calibers.length === 0) {
          const key = `${condition}|${modelId}|0`;
          if (seen.has(key)) continue;
          seen.add(key);
          out.push({
            id: randomUUID(),
            condition,
            manufacturerId,
            manufacturer,
            isCommon,
            modelId,
            model: modelName,
            caliberId: 0,
            caliber: "",
            syncedAt,
          });
          continue;
        }
        for (const cal of calibers) {
          const caliberId = toInt(cal.CaliberID);
          const caliber = String(cal.Caliber ?? "").trim();
          if (!caliberId) continue;
          const key = `${condition}|${modelId}|${caliberId}`;
          if (seen.has(key)) continue;
          seen.add(key);
          out.push({
            id: randomUUID(),
            condition,
            manufacturerId,
            manufacturer,
            isCommon,
            modelId,
            model: modelName,
            caliberId,
            caliber,
            syncedAt,
          });
        }
      }
    }
  }
  return out;
}
