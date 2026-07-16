/**
 * POST /api/oa/sync-catalog
 * Body: { mode?: "catalog" | "full" | "comps", force?: boolean, limit?: number, background?: boolean }
 *
 * - catalog: brand/model/caliber tree only
 * - full (default for UI): catalog + sold/asking comps for every leaf
 * - comps: comps only (resume / refresh)
 *
 * Full sync can take hours; with background:true returns 202 and continues in-process.
 */

import { NextResponse } from "next/server";
import { z } from "zod";

import { GbaApiError } from "@/lib/gba/client";
import { syncOaCatalog } from "@/lib/oa/sync-catalog";
import { startOaFullSync, syncOaFull } from "@/lib/oa/sync-full";

export const runtime = "nodejs";
export const maxDuration = 300;

const bodySchema = z.object({
  mode: z.enum(["catalog", "full", "comps"]).optional().default("full"),
  force: z.boolean().optional().default(false),
  limit: z.number().int().positive().optional(),
  background: z.boolean().optional().default(true),
  concurrency: z.number().int().min(1).max(8).optional(),
});

export async function POST(request: Request): Promise<NextResponse> {
  let body: z.infer<typeof bodySchema> = {
    mode: "full",
    force: false,
    background: true,
  };
  try {
    const json = (await request.json()) as unknown;
    body = bodySchema.parse(json ?? {});
  } catch {
    /* empty body → full background sync */
  }

  try {
    if (body.mode === "catalog") {
      const report = await syncOaCatalog();
      return NextResponse.json({ ok: true, mode: "catalog", report });
    }

    const opts = {
      forceComps: body.force,
      limit: body.limit,
      concurrency: body.concurrency,
      compsOnly: body.mode === "comps",
    };

    if (body.background) {
      const started = startOaFullSync(opts);
      return NextResponse.json(
        {
          ok: true,
          mode: body.mode,
          background: true,
          ...started,
          message: started.alreadyRunning
            ? "Full sync already running — poll /api/oa/sync-status for progress."
            : "Full sync started. Poll /api/oa/sync-status for progress (catalog then comps).",
        },
        { status: 202 },
      );
    }

    const report = await syncOaFull(opts);
    return NextResponse.json({ ok: true, mode: body.mode, report });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    let status = 500;
    if (message.includes("No Outdoor Analytics token")) status = 409;
    if (err instanceof GbaApiError && err.status === 401) status = 401;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
