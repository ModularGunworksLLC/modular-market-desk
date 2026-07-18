/**
 * Time-window sold stats from oa_sold_comps (30d / 90d / all).
 */

import "server-only";

import { and, eq } from "drizzle-orm";

import { summarize } from "@/lib/arbitrage/stats";
import type { PriceStats } from "@/lib/arbitrage/types";
import { db } from "@/lib/db";
import { oaSoldComps } from "@/lib/db/schema";

function parseSalesDate(raw: string): Date | null {
  if (!raw?.trim()) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

export type SoldWindowStats = {
  all: PriceStats;
  d30: PriceStats;
  d90: PriceStats;
  newestSalesDate: string | null;
};

export async function loadSoldWindowStats(leaf: {
  condition: string;
  modelId: number;
  caliberId: number;
}): Promise<SoldWindowStats> {
  const rows = await db
    .select()
    .from(oaSoldComps)
    .where(
      and(
        eq(oaSoldComps.condition, leaf.condition),
        eq(oaSoldComps.modelId, leaf.modelId),
        eq(oaSoldComps.caliberId, leaf.caliberId),
      ),
    );

  const now = Date.now();
  const allPrices: number[] = [];
  const d30: number[] = [];
  const d90: number[] = [];
  let newest: Date | null = null;

  for (const r of rows) {
    if (!(r.price > 0)) continue;
    allPrices.push(r.price);
    const dt = parseSalesDate(r.salesDate);
    if (dt && (!newest || dt > newest)) newest = dt;
    if (dt) {
      const age = now - dt.getTime();
      if (age <= 30 * 24 * 60 * 60 * 1000) d30.push(r.price);
      if (age <= 90 * 24 * 60 * 60 * 1000) d90.push(r.price);
    }
  }

  return {
    all: summarize(allPrices),
    d30: summarize(d30),
    d90: summarize(d90),
    newestSalesDate: newest ? newest.toISOString().slice(0, 10) : null,
  };
}

/** Prefer 30d when n>=5, else 90d when n>=5, else all-time. */
export function pickFreshSoldStats(windows: SoldWindowStats): {
  sold: PriceStats;
  window: "30d" | "90d" | "all";
} {
  if (windows.d30.count >= 5) return { sold: windows.d30, window: "30d" };
  if (windows.d90.count >= 5) return { sold: windows.d90, window: "90d" };
  return { sold: windows.all, window: "all" };
}
