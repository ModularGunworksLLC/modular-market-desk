import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { tradeInPhotos, tradeInRequests } from "@/lib/db/schema";
import { ensureTradeInTables } from "@/lib/trade-in/ensure";

export const runtime = "nodejs";

export async function GET() {
  await ensureTradeInTables();
  const rows = await db
    .select()
    .from(tradeInRequests)
    .orderBy(desc(tradeInRequests.createdAt))
    .limit(200);

  const withCounts = await Promise.all(
    rows.map(async (r) => {
      const photos = await db
        .select({ id: tradeInPhotos.id })
        .from(tradeInPhotos)
        .where(eq(tradeInPhotos.requestId, r.id));
      return { ...r, photoCount: photos.length };
    }),
  );

  return NextResponse.json({ ok: true, items: withCounts });
}
