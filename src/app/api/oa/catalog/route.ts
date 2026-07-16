/**
 * GET /api/oa/catalog
 * Cascading OA catalog browse from synced SQLite (make → model → caliber).
 *
 *   ?level=manufacturers&condition=USED
 *   ?level=models&condition=USED&manufacturerId=123
 *   ?level=calibers&condition=USED&modelId=456
 */

import { NextResponse } from "next/server";
import { and, asc, eq, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { oaCatalog, oaMarketStats } from "@/lib/db/schema";
import { ensureOaCatalogTables } from "@/lib/oa/sync-catalog";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<NextResponse> {
  await ensureOaCatalogTables();
  const url = new URL(request.url);
  const level = (url.searchParams.get("level") ?? "manufacturers").toLowerCase();
  const conditionRaw = (url.searchParams.get("condition") ?? "USED").toUpperCase();
  const condition = conditionRaw === "NEW" ? "NEW" : "USED";

  try {
    if (level === "manufacturers") {
      const rows = await db
        .select({
          manufacturerId: oaCatalog.manufacturerId,
          manufacturer: oaCatalog.manufacturer,
          isCommon: oaCatalog.isCommon,
          modelCount: sql<number>`count(distinct ${oaCatalog.modelId})`,
        })
        .from(oaCatalog)
        .where(eq(oaCatalog.condition, condition))
        .groupBy(oaCatalog.manufacturerId, oaCatalog.manufacturer, oaCatalog.isCommon)
        .orderBy(asc(oaCatalog.manufacturer));

      return NextResponse.json({
        ok: true,
        condition,
        level,
        items: rows.map((r) => ({
          id: r.manufacturerId,
          name: r.manufacturer,
          isCommon: Boolean(r.isCommon),
          modelCount: Number(r.modelCount ?? 0),
        })),
      });
    }

    if (level === "models") {
      const manufacturerId = Number(url.searchParams.get("manufacturerId"));
      if (!Number.isFinite(manufacturerId) || manufacturerId <= 0) {
        return NextResponse.json({ error: "manufacturerId required" }, { status: 400 });
      }
      const rows = await db
        .select({
          modelId: oaCatalog.modelId,
          model: oaCatalog.model,
          caliberCount: sql<number>`count(distinct ${oaCatalog.caliberId})`,
        })
        .from(oaCatalog)
        .where(and(eq(oaCatalog.condition, condition), eq(oaCatalog.manufacturerId, manufacturerId)))
        .groupBy(oaCatalog.modelId, oaCatalog.model)
        .orderBy(asc(oaCatalog.model));

      return NextResponse.json({
        ok: true,
        condition,
        level,
        manufacturerId,
        items: rows.map((r) => ({
          id: r.modelId,
          name: r.model,
          caliberCount: Number(r.caliberCount ?? 0),
        })),
      });
    }

    if (level === "calibers") {
      const modelId = Number(url.searchParams.get("modelId"));
      if (!Number.isFinite(modelId) || modelId <= 0) {
        return NextResponse.json({ error: "modelId required" }, { status: 400 });
      }
      const rows = await db
        .select({
          caliberId: oaCatalog.caliberId,
          caliber: oaCatalog.caliber,
          soldCount: oaMarketStats.soldCount,
          soldP25: oaMarketStats.soldP25,
          soldMedian: oaMarketStats.soldMedian,
        })
        .from(oaCatalog)
        .leftJoin(
          oaMarketStats,
          and(
            eq(oaMarketStats.condition, oaCatalog.condition),
            eq(oaMarketStats.modelId, oaCatalog.modelId),
            eq(oaMarketStats.caliberId, oaCatalog.caliberId),
          ),
        )
        .where(
          and(
            eq(oaCatalog.condition, condition),
            eq(oaCatalog.modelId, modelId),
            sql`${oaCatalog.caliberId} > 0`,
          ),
        )
        .orderBy(asc(oaCatalog.caliber));

      return NextResponse.json({
        ok: true,
        condition,
        level,
        modelId,
        items: rows.map((r) => ({
          id: r.caliberId,
          name: r.caliber,
          soldCount: r.soldCount != null ? Number(r.soldCount) : 0,
          soldP25: r.soldP25 != null ? Number(r.soldP25) : null,
          soldMedian: r.soldMedian != null ? Number(r.soldMedian) : null,
        })),
      });
    }

    return NextResponse.json({ error: `Unknown level "${level}"` }, { status: 400 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
