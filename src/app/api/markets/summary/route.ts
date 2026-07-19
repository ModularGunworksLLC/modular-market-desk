/**
 * GET /api/markets/summary
 * Seasonality, hot brands/calibers, OA coverage from local SQLite.
 *
 * Query: ?condition=ANY|USED|NEW&category=all|handgun|rifle|shotgun
 */

import { NextResponse } from "next/server";

import {
  getMarketsSummary,
  type MarketsCategoryFilter,
  type MarketsConditionFilter,
} from "@/lib/markets/aggregates";

export const runtime = "nodejs";

function parseCondition(raw: string | null): MarketsConditionFilter {
  const v = (raw ?? "ANY").toUpperCase();
  if (v === "USED" || v === "NEW" || v === "ANY") return v;
  return "ANY";
}

function parseCategory(raw: string | null): MarketsCategoryFilter {
  const v = (raw ?? "all").toLowerCase();
  if (v === "handgun" || v === "rifle" || v === "shotgun" || v === "all") return v;
  return "all";
}

export async function GET(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const condition = parseCondition(url.searchParams.get("condition"));
  const category = parseCategory(url.searchParams.get("category"));

  try {
    const summary = await getMarketsSummary(condition, category);
    return NextResponse.json({ ok: true, ...summary });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
