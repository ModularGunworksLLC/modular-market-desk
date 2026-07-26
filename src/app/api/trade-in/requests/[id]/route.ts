import { asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { tradeInPhotos, tradeInRequests } from "@/lib/db/schema";
import { ensureTradeInTables } from "@/lib/trade-in/ensure";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  await ensureTradeInTables();
  const rows = await db.select().from(tradeInRequests).where(eq(tradeInRequests.id, id)).limit(1);
  const row = rows[0];
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const photos = await db
    .select()
    .from(tradeInPhotos)
    .where(eq(tradeInPhotos.requestId, id))
    .orderBy(asc(tradeInPhotos.sortOrder));
  return NextResponse.json({ ok: true, item: row, photos });
}

export async function PATCH(request: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  await ensureTradeInTables();
  let body: { status?: string };
  try {
    body = (await request.json()) as { status?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (body.status !== "handled" && body.status !== "submitted") {
    return NextResponse.json({ error: "status must be submitted or handled" }, { status: 400 });
  }
  const handledAt = body.status === "handled" ? new Date() : null;
  await db
    .update(tradeInRequests)
    .set({ status: body.status, handledAt, updatedAt: new Date() })
    .where(eq(tradeInRequests.id, id));
  return NextResponse.json({ ok: true });
}
