/**
 * POST /api/wholesale/scan
 * Rank in-stock catalog firearms by GO/NO-GO using live GBA comps.
 */

import { NextResponse } from "next/server";
import { z } from "zod";

import { scanWholesaleDeals } from "@/lib/wholesale-scan";

export const runtime = "nodejs";
export const maxDuration = 300;

const bodySchema = z.object({
  vendor: z.string().optional().default("2ndamendmentwholesale"),
  limit: z.number().int().min(1).max(100).optional().default(40),
  targetProfit: z.number().nonnegative().optional(),
  minMarginPct: z.number().min(0).optional(),
  inboundShip: z.number().nonnegative().optional().default(0),
});

export async function POST(request: Request): Promise<NextResponse> {
  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await request.json());
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }

  try {
    const summary = await scanWholesaleDeals({
      vendor: body.vendor,
      limit: body.limit,
      targetProfit: body.targetProfit,
      minMarginPct: body.minMarginPct,
      inboundShip: body.inboundShip,
    });
    return NextResponse.json({ ok: true, ...summary });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
