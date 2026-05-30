/**
 * POST /api/evaluate
 * Runs the two-avenue arbitrage evaluation:
 *   - Wholesale cross-reference (local Postgres catalogs)
 *   - Market comps (GunBroker Analytics live, if a token + resolved ids are provided;
 *     otherwise uses manually supplied sold/asking prices)
 * Computes Route A / Route B leakage, GO/NO-GO, and Max Bid, then persists the valuation.
 */

import { NextResponse } from "next/server";

import { evaluateDeal } from "@/lib/arbitrage/evaluate";
import { summarize } from "@/lib/arbitrage/stats";
import type { DealInput, PriceStats } from "@/lib/arbitrage/types";
import { canonicalKey } from "@/lib/canonical";
import { getMarketToken } from "@/lib/connections";
import { db } from "@/lib/db";
import { valuations } from "@/lib/db/schema";
import { GbaApiClient, GbaApiError } from "@/lib/gba/client";
import { evaluateSchema } from "@/lib/validation";
import { crossReferenceWholesale } from "@/lib/wholesale";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<NextResponse> {
  const json = await request.json().catch(() => null);
  const parsed = evaluateSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const body = parsed.data;

  const input: DealInput = {
    targetAcquisitionCost: body.targetAcquisitionCost,
    inboundShip: body.inboundShip,
    buyerPremiumPct: body.buyerPremiumPct,
    outboundShip: body.outboundShip,
    listingUpgrades: body.listingUpgrades,
    targetProfit: body.targetProfit,
    minMarginPct: body.minMarginPct,
  };

  const sourceStatus: Record<string, string> = {};

  // --- Avenue 1: market comps ---
  let sold: PriceStats;
  let asking: PriceStats;
  if (body.gba) {
    const token = await getMarketToken();
    if (!token) {
      return NextResponse.json(
        { error: "No active Outdoor Analytics token in the Session Vault. Paste one in Connections." },
        { status: 409 },
      );
    }
    try {
      const market = await new GbaApiClient(token).market(body.gba);
      sold = market.sold;
      asking = market.asking;
      sourceStatus.gba = `ok (${sold.count} sold, ${asking.count} asking)`;
    } catch (err) {
      const status = err instanceof GbaApiError ? (err.status ?? 502) : 502;
      return NextResponse.json({ error: (err as Error).message }, { status });
    }
  } else {
    sold = summarize(body.soldPrices ?? []);
    asking = summarize(body.askingPrices ?? []);
    sourceStatus.manual = `manual (${sold.count} sold, ${asking.count} asking)`;
  }

  // --- Avenue 2: wholesale cross-reference ---
  const wholesale = await crossReferenceWholesale({
    upc: body.upc,
    manufacturer: body.manufacturer,
    model: body.model,
    targetAcquisitionCost: body.targetAcquisitionCost,
  });
  sourceStatus.wholesale = `${wholesale.matches.length} distributor rows`;

  // --- Math engine ---
  const result = evaluateDeal(input, sold);

  // --- Persist ---
  const key = canonicalKey({
    category: body.category,
    manufacturer: body.manufacturer,
    model: body.model,
    caliber: body.caliber,
    condition: body.condition,
  });
  const money = (n: number) => n.toFixed(2);

  await db.insert(valuations).values({
    canonicalKey: key,
    category: body.category,
    manufacturer: body.manufacturer,
    model: body.model,
    upc: body.upc || null,
    mpn: body.mpn || null,
    caliber: body.caliber || null,
    condition: body.condition,
    targetAcquisitionCost: money(body.targetAcquisitionCost),
    inboundShip: money(body.inboundShip),
    buyerPremiumPct: money(body.buyerPremiumPct),
    outboundShip: money(body.outboundShip),
    listingUpgrades: money(body.listingUpgrades),
    targetProfit: money(body.targetProfit),
    minMarginPct: money(body.minMarginPct),
    allInCost: money(result.allInCost),
    soldStats: sold,
    askingStats: asking,
    verdict: result.verdict,
    bestRoute: result.bestRoute === "gunbroker" ? "gunbroker" : "local_al",
    maxBid: money(result.maxBid),
    netProfit: money(result.netProfit),
    marginPct: money(result.marginPct),
    routeA: result.chosen.routeA,
    routeB: result.chosen.routeB,
    wholesaleGrid: wholesale,
    sourceStatus,
    raw: result,
  });

  return NextResponse.json({ result, asking, wholesale, sourceStatus });
}
