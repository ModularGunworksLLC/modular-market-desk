import { randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { tgvModels, tgvModelStats, tgvSoldComps } from "@/lib/db/tgv-schema";

import { ensureTgvTables } from "./ensure";
import type { TgvCategory, TgvPageParse } from "./parse";
import { normalizeBrandModelKey, tgvModelPath } from "./resolve-url";

export type UpsertTgvResult = {
  modelRowId: string;
  soldRows: number;
};

export async function upsertTgvPage(opts: {
  manufacturer: string;
  model: string;
  category: TgvCategory;
  gapReason?: string;
  parsed: TgvPageParse;
  tgvPath?: string;
}): Promise<UpsertTgvResult> {
  await ensureTgvTables();
  const manufacturer = opts.manufacturer.trim();
  const model = opts.model.trim();
  const category = opts.category;
  const path = opts.tgvPath ?? tgvModelPath(manufacturer, model, category);
  const now = new Date();

  const existing = await db
    .select()
    .from(tgvModels)
    .where(
      and(
        eq(tgvModels.manufacturer, manufacturer),
        eq(tgvModels.model, model),
        eq(tgvModels.category, category),
      ),
    )
    .limit(1);

  let modelRowId = existing[0]?.id;
  if (!modelRowId) {
    modelRowId = randomUUID();
    await db.insert(tgvModels).values({
      id: modelRowId,
      manufacturer,
      model,
      category,
      tgvPath: path,
      gapReason: opts.gapReason ?? "manual",
      lastStatus: "ok",
      lastError: null,
      syncedAt: now,
      updatedAt: now,
    });
  } else {
    await db
      .update(tgvModels)
      .set({
        tgvPath: path,
        lastStatus: "ok",
        lastError: null,
        syncedAt: now,
        updatedAt: now,
        gapReason: opts.gapReason ?? existing[0]!.gapReason,
      })
      .where(eq(tgvModels.id, modelRowId));
  }

  const p = opts.parsed;
  const statsExisting = await db
    .select()
    .from(tgvModelStats)
    .where(
      and(
        eq(tgvModelStats.manufacturer, manufacturer),
        eq(tgvModelStats.model, model),
        eq(tgvModelStats.category, category),
      ),
    )
    .limit(1);

  const statsValues = {
    modelRowId,
    manufacturer,
    model,
    category,
    privatePartyUsed: p.privatePartyUsed,
    privatePartyNew: p.privatePartyNew,
    tradeInUsed: p.tradeInUsed,
    tradeInNew: p.tradeInNew,
    soldCount: p.soldCount,
    usedSoldCount: p.usedSoldCount,
    newSoldCount: p.newSoldCount,
    avg12mUsed: p.avg12mUsed,
    avg12mNew: p.avg12mNew,
    source: "tgv" as const,
    tgvPath: path,
    meta: {
      parsedManufacturer: p.manufacturer,
      parsedModel: p.model,
      sampleSoldCount: p.solds.length,
    },
    syncedAt: now,
  };

  if (statsExisting[0]) {
    await db.update(tgvModelStats).set(statsValues).where(eq(tgvModelStats.id, statsExisting[0].id));
  } else {
    await db.insert(tgvModelStats).values({ id: randomUUID(), ...statsValues });
  }

  await db.delete(tgvSoldComps).where(eq(tgvSoldComps.modelRowId, modelRowId));
  if (p.solds.length) {
    await db.insert(tgvSoldComps).values(
      p.solds.map((s) => ({
        id: randomUUID(),
        modelRowId: modelRowId!,
        price: s.price,
        condition: s.condition,
        title: s.title,
        caliber: s.caliber,
        manufacturer: s.manufacturer || manufacturer,
        model: s.model || model,
        salesDateText: s.salesDateText,
        salesDateAttr: s.salesDateAttr,
        externalItemId: s.externalItemId,
        location: s.location,
        upc: s.upc,
        sku: s.sku,
        source: "tgv",
        syncedAt: now,
      })),
    );
  }

  return { modelRowId, soldRows: p.solds.length };
}

export async function markTgvModelStatus(opts: {
  manufacturer: string;
  model: string;
  category: TgvCategory;
  status: "pending" | "ok" | "not_found" | "cf_blocked" | "error";
  error?: string | null;
  gapReason?: string;
  tgvPath?: string;
}): Promise<string> {
  await ensureTgvTables();
  const manufacturer = opts.manufacturer.trim();
  const model = opts.model.trim();
  const category = opts.category;
  const path = opts.tgvPath ?? tgvModelPath(manufacturer, model, category);
  const now = new Date();

  const existing = await db
    .select()
    .from(tgvModels)
    .where(
      and(
        eq(tgvModels.manufacturer, manufacturer),
        eq(tgvModels.model, model),
        eq(tgvModels.category, category),
      ),
    )
    .limit(1);

  if (existing[0]) {
    await db
      .update(tgvModels)
      .set({
        lastStatus: opts.status,
        lastError: opts.error ?? null,
        tgvPath: path,
        updatedAt: now,
        syncedAt: opts.status === "ok" ? now : existing[0].syncedAt,
      })
      .where(eq(tgvModels.id, existing[0].id));
    return existing[0].id;
  }

  const id = randomUUID();
  await db.insert(tgvModels).values({
    id,
    manufacturer,
    model,
    category,
    tgvPath: path,
    gapReason: opts.gapReason ?? "oa_missing",
    lastStatus: opts.status,
    lastError: opts.error ?? null,
    syncedAt: opts.status === "ok" ? now : null,
    updatedAt: now,
  });
  return id;
}

export type TgvAdvisoryStats = {
  source: "tgv";
  manufacturer: string;
  model: string;
  category: string;
  privatePartyUsed: number | null;
  privatePartyNew: number | null;
  tradeInUsed: number | null;
  tradeInNew: number | null;
  soldCount: number;
  usedSoldCount: number | null;
  newSoldCount: number | null;
  avg12mUsed: number | null;
  avg12mNew: number | null;
  tgvPath: string;
  syncedAt: string | null;
  match: "exact" | "normalized";
};

function toAdvisory(
  row: typeof tgvModelStats.$inferSelect,
  match: "exact" | "normalized",
): TgvAdvisoryStats {
  return {
    source: "tgv",
    manufacturer: row.manufacturer,
    model: row.model,
    category: row.category,
    privatePartyUsed: row.privatePartyUsed,
    privatePartyNew: row.privatePartyNew,
    tradeInUsed: row.tradeInUsed,
    tradeInNew: row.tradeInNew,
    soldCount: row.soldCount ?? 0,
    usedSoldCount: row.usedSoldCount,
    newSoldCount: row.newSoldCount,
    avg12mUsed: row.avg12mUsed,
    avg12mNew: row.avg12mNew,
    tgvPath: row.tgvPath,
    syncedAt: row.syncedAt ? new Date(row.syncedAt).toISOString() : null,
    match,
  };
}

/**
 * Read-only local TGV bank lookup. No live fetch.
 * Prefer exact make/model/category, then any category, then normalized key.
 */
export async function lookupLocalTgvStats(opts: {
  manufacturer: string;
  model: string;
  category?: string;
}): Promise<TgvAdvisoryStats | null> {
  await ensureTgvTables();
  const manufacturer = opts.manufacturer.trim();
  const model = opts.model.trim();
  if (!manufacturer || !model) return null;

  const category = (opts.category ?? "").trim();
  if (category) {
    const exact = await db
      .select()
      .from(tgvModelStats)
      .where(
        and(
          eq(tgvModelStats.manufacturer, manufacturer),
          eq(tgvModelStats.model, model),
          eq(tgvModelStats.category, category),
        ),
      )
      .limit(1);
    if (exact[0]) return toAdvisory(exact[0], "exact");
  }

  const anyCat = await db
    .select()
    .from(tgvModelStats)
    .where(and(eq(tgvModelStats.manufacturer, manufacturer), eq(tgvModelStats.model, model)))
    .limit(1);
  if (anyCat[0]) return toAdvisory(anyCat[0], "exact");

  const want = normalizeBrandModelKey(manufacturer, model);
  const pool = await db.select().from(tgvModelStats).limit(5000);
  for (const row of pool) {
    if (normalizeBrandModelKey(row.manufacturer, row.model) === want) {
      return toAdvisory(row, "normalized");
    }
  }

  // Soft: same brand token + model contains / contained
  const mfrTok = manufacturer.toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim().split(/\s+/)[0] ?? "";
  const modelNorm = model.toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();
  if (mfrTok.length >= 3 && modelNorm.length >= 3) {
    for (const row of pool) {
      const rowMfr = row.manufacturer.toUpperCase().replace(/[^A-Z0-9]+/g, " ");
      const rowMod = row.model.toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();
      if (!rowMfr.includes(mfrTok)) continue;
      if (rowMod === modelNorm || rowMod.includes(modelNorm) || modelNorm.includes(rowMod)) {
        return toAdvisory(row, "normalized");
      }
    }
  }

  return null;
}
