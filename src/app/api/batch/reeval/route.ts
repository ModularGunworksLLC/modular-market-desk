/**
 * POST /api/batch/reeval
 * Re-evaluate a small set of lots (e.g. after web enrich becomes Ready) and
 * return JSON rows to patch into the open buy-sheet — no full sheet re-run.
 */

import { NextResponse } from "next/server";
import { z } from "zod";

import { errorMessage } from "@/lib/api-error";
import {
  batchDefaultsSchema,
  batchRowSchema,
  evaluateBatchRow,
} from "@/lib/batch/evaluate-row";
import { getMarketToken } from "@/lib/connections";

export const runtime = "nodejs";
export const maxDuration = 300;

const CONCURRENCY = 2;

const bodySchema = z.object({
  rows: z.array(batchRowSchema).min(1).max(50),
  defaults: batchDefaultsSchema,
});

export async function POST(request: Request): Promise<NextResponse> {
  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const { rows, defaults } = parsed.data;
    const token = await getMarketToken();
    const out: Awaited<ReturnType<typeof evaluateBatchRow>>[] = new Array(rows.length);
    let next = 0;

    const worker = async () => {
      while (next < rows.length) {
        const idx = next++;
        const row = rows[idx]!;
        out[idx] = await evaluateBatchRow(row, defaults, token);
      }
    };

    await Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, rows.length) }, () => worker()),
    );

    return NextResponse.json({ rows: out });
  } catch (err) {
    return NextResponse.json({ error: errorMessage(err) }, { status: 500 });
  }
}
