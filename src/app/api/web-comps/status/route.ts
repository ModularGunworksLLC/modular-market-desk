/**
 * GET /api/web-comps/status — drip queue depth, daily budget, last error.
 * POST /api/web-comps/status — per-key enrich phases for batch badge polling.
 *   body: { keys: string[] }
 */

import { NextResponse } from "next/server";
import { z } from "zod";

import { errorMessage } from "@/lib/api-error";
import { getEnrichStatusesForKeys, webCompsQueueStatus } from "@/lib/web-comps/queue";

export const runtime = "nodejs";

export async function GET(): Promise<NextResponse> {
  return NextResponse.json(webCompsQueueStatus());
}

const postSchema = z.object({
  keys: z.array(z.string().min(1)).max(200),
});

export async function POST(request: Request): Promise<NextResponse> {
  const json = await request.json().catch(() => null);
  const parsed = postSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  try {
    const keys = await getEnrichStatusesForKeys(parsed.data.keys);
    return NextResponse.json({
      queue: webCompsQueueStatus(),
      keys,
    });
  } catch (err) {
    return NextResponse.json({ error: errorMessage(err) }, { status: 500 });
  }
}
