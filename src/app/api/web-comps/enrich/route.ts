/**
 * POST /api/web-comps/enrich
 * Enqueue (default) or immediately run one Tavily enrich for an identity.
 * Never sends fee math / vault secrets — identity fields only.
 */

import { NextResponse } from "next/server";
import { z } from "zod";

import { errorMessage } from "@/lib/api-error";
import { enrichNow, enqueueWebEnrich } from "@/lib/web-comps/queue";

export const runtime = "nodejs";
export const maxDuration = 120;

const bodySchema = z.object({
  manufacturer: z.string().min(1),
  model: z.string().min(1),
  caliber: z.string().optional(),
  variant: z.string().optional(),
  upc: z.string().optional(),
  mpn: z.string().optional(),
  category: z.string().optional(),
  /** When true, run enrich now (still counts toward daily budget). */
  immediate: z.boolean().optional().default(false),
});

export async function POST(request: Request): Promise<NextResponse> {
  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { immediate, ...identity } = parsed.data;
  try {
    if (immediate) {
      const result = await enrichNow(identity);
      return NextResponse.json(result);
    }
    const queued = await enqueueWebEnrich(identity);
    return NextResponse.json(queued);
  } catch (err) {
    return NextResponse.json({ error: errorMessage(err) }, { status: 500 });
  }
}
