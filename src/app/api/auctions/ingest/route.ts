import { z } from "zod";
import { NextResponse } from "next/server";

import {
  AuctionIngestError,
  auctionPlatformLabel,
  detectAuctionPlatform,
  ingestAuction,
  lotsToBatchCsv,
} from "@/lib/auctions/ingest";
import { errorMessage } from "@/lib/api-error";

export const runtime = "nodejs";
export const maxDuration = 120;

const bodySchema = z.object({
  url: z.string().url(),
  buyerPremiumPct: z.number().min(0).max(100).optional().default(15),
  firearmsOnly: z.boolean().optional().default(true),
  maxPages: z.number().int().min(1).max(60).optional(),
});

export async function POST(request: Request): Promise<NextResponse> {
  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const platform = detectAuctionPlatform(parsed.data.url);
    const defaultPages = platform === "proxibid" ? 5 : platform === "bidwrangler" ? 40 : 12;
    const ingested = await ingestAuction(parsed.data.url, {
      maxPages: parsed.data.maxPages ?? defaultPages,
    });
    const forSheet = parsed.data.firearmsOnly ? ingested.firearmLots : ingested.lots;
    const csv = lotsToBatchCsv(forSheet, parsed.data.buyerPremiumPct);

    return NextResponse.json({
      ...ingested,
      platformLabel: auctionPlatformLabel(ingested.platform),
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
