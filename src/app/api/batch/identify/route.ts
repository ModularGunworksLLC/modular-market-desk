import { z } from "zod";
import { NextResponse } from "next/server";

import { IdentifyError, identifyFirearm } from "@/lib/identify";
import { persistIdentifySnapshot } from "@/lib/identify/persist";
import type { IdentifyImage } from "@/lib/identify/types";

export const runtime = "nodejs";
export const maxDuration = 300;

const lotSchema = z.object({
  lot: z.string(),
  title: z.string(),
  imageUrls: z.array(z.string()).optional().default([]),
  currentBid: z.number().nullable().optional(),
  buyerPremiumPct: z.number().optional(),
});

const bodySchema = z.object({
  lots: z.array(lotSchema).min(1).max(80),
  concurrency: z.number().int().min(1).max(4).optional().default(2),
  maxImagesPerLot: z.number().int().min(0).max(3).optional().default(2),
});

async function fetchLotImages(urls: string[], max: number): Promise<IdentifyImage[]> {
  const out: IdentifyImage[] = [];
  for (const url of urls.slice(0, max)) {
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(12_000),
        headers: { "User-Agent": "ModularMarketDesk/1.0" },
      });
      if (!res.ok) continue;
      const mime = (res.headers.get("content-type") || "image/jpeg").split(";")[0]!.trim();
      if (!mime.startsWith("image/")) continue;
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 64 || buf.length > 8 * 1024 * 1024) continue;
      out.push({ mimeType: mime, dataBase64: buf.toString("base64") });
    } catch {
      // skip failed image
    }
  }
  return out;
}

export async function POST(request: Request): Promise<NextResponse> {
  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { lots, concurrency, maxImagesPerLot } = parsed.data;
  const results: Array<{
    lot: string;
    title: string;
    manufacturer: string;
    model: string;
    caliber: string;
    category: string;
    confidence: number;
    modelUsed: string;
    error?: string;
  }> = [];

  let cursor = 0;
  async function worker() {
    for (;;) {
      const i = cursor++;
      if (i >= lots.length) return;
      const lot = lots[i]!;
      try {
        const images =
          maxImagesPerLot > 0 && lot.imageUrls?.length
            ? await fetchLotImages(lot.imageUrls, maxImagesPerLot)
            : [];
        const result = await identifyFirearm({
          images,
          hintText: `Auction lot ${lot.lot}: ${lot.title}`,
        });
        await persistIdentifySnapshot({
          source: "auction",
          result,
          lot: lot.lot,
          hintText: lot.title,
        }).catch(() => null);
        results.push({
          lot: lot.lot,
          title: lot.title,
          manufacturer: result.evaluateDefaults.manufacturer,
          model: result.evaluateDefaults.model,
          caliber: result.evaluateDefaults.caliber,
          category: result.evaluateDefaults.category,
          confidence: result.identity.confidence,
          modelUsed: result.modelUsed,
        });
      } catch (err) {
        const msg = err instanceof IdentifyError ? err.message : (err as Error).message;
        results.push({
          lot: lot.lot,
          title: lot.title,
          manufacturer: "",
          model: "",
          caliber: "",
          category: "handgun",
          confidence: 0,
          modelUsed: "",
          error: msg,
        });
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, lots.length) }, () => worker()));

  // Preserve input order
  const byLot = new Map(results.map((r) => [r.lot, r]));
  const ordered = lots.map((l) => byLot.get(l.lot)!).filter(Boolean);

  const csvHeader = "Lot,Make,Model,Caliber,Category,Title,Current Bid,Buyer Premium";
  const csvLines = lots.map((l) => {
    const r = byLot.get(l.lot);
    const make = r?.manufacturer ? `"${r.manufacturer.replace(/"/g, '""')}"` : "";
    const model = r?.model ? `"${r.model.replace(/"/g, '""')}"` : "";
    const title = `"${l.title.replace(/"/g, '""')}"`;
    const bid = l.currentBid == null ? "" : String(l.currentBid);
    const bp = l.buyerPremiumPct ?? 15;
    const cal = r?.caliber ? `"${r.caliber.replace(/"/g, '""')}"` : "";
    const cat = r?.category || "";
    return `${l.lot},${make},${model},${cal},${cat},${title},${bid},${bp}`;
  });

  const ok = ordered.filter((r) => r.manufacturer && r.model).length;
  return NextResponse.json({
    resolved: ok,
    failed: ordered.length - ok,
    results: ordered,
    batchCsv: [csvHeader, ...csvLines].join("\n"),
  });
}
