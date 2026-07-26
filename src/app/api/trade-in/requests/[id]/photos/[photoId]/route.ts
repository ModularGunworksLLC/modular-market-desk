import { readFile } from "node:fs/promises";

import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { tradeInPhotos } from "@/lib/db/schema";
import { ensureTradeInTables } from "@/lib/trade-in/ensure";
import { absolutePhotoPath } from "@/lib/trade-in/storage";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string; photoId: string }> };

export async function GET(request: Request, ctx: Ctx) {
  const { id, photoId } = await ctx.params;
  await ensureTradeInTables();
  const rows = await db
    .select()
    .from(tradeInPhotos)
    .where(and(eq(tradeInPhotos.id, photoId), eq(tradeInPhotos.requestId, id)))
    .limit(1);
  const photo = rows[0];
  if (!photo) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const wantThumb = new URL(request.url).searchParams.get("thumb") === "1";
  const name = wantThumb && photo.thumbName ? photo.thumbName : photo.storedName;
  try {
    const buf = await readFile(absolutePhotoPath(id, name));
    return new NextResponse(buf, {
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return NextResponse.json({ error: "File missing" }, { status: 404 });
  }
}
