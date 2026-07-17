import { z } from "zod";
import { NextResponse } from "next/server";

import { AuctionIngestError, ingestHibidAuction, lotsToBatchCsv } from "@/lib/auctions/hibid";
import { errorMessage } from "@/lib/api-error";

export const runtime = "nodejs";
export const maxDuration = 120;

const bodySchema = z.object({
  url: z.string().url(),
  buyerPremiumPct: z.number().min(0).max(100).optional().default(15),
  firearmsOnly: z.boolean().optional().default(true),
  maxPages: z.number().int().min(1).max(30).optional().default(12),
});

export async function POST(request: Request): Promise<NextResponse> {
  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const ingested = await ingestHibidAuction(parsed.data.url, {
      maxPages: parsed.data.maxPages,
    });
    const forSheet = parsed.data.firearmsOnly ? ingested.firearmLots : ingested.lots;
    const csv = lotsToBatchCsv(forSheet, parsed.data.buyerPremiumPct);

    return NextResponse.json({
      ...ingested,
      sheetLots: forSheet,
      batchCsv: csv,
      buyerPremiumPct: parsed.data.buyerPremiumPct,
    });
  } catch (err) {
    if (err instanceof AuctionIngestError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: errorMessage(err) }, { status: 500 });
  }
}
