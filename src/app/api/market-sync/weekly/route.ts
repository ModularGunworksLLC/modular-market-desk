import { NextResponse } from "next/server";

import { maybeKickWeeklyMarketSync } from "@/lib/market-sync/schedule";
import {
  getMarketSyncStatus,
  startWeeklyMarketSync,
  syncWeeklyMarket,
} from "@/lib/market-sync/weekly";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 3600;

export async function GET() {
  try {
    const kick = await maybeKickWeeklyMarketSync();
    const status = await getMarketSyncStatus();
    return NextResponse.json({ ...status, autoKick: kick });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      background?: boolean;
      skipOa?: boolean;
      forceOa?: boolean;
      skipAsks?: boolean;
    };

    if (body.background !== false) {
      const started = startWeeklyMarketSync({
        skipOa: body.skipOa,
        forceOa: body.forceOa,
        skipAsks: body.skipAsks,
      });
      if (started.alreadyRunning) {
        return NextResponse.json(
          {
            ok: true,
            alreadyRunning: true,
            runId: started.runId,
            message: "Weekly market sync already running.",
          },
          { status: 202 },
        );
      }
      return NextResponse.json(
        {
          ok: true,
          started: true,
          runId: started.runId,
          message: "Weekly market sync started. Poll GET /api/market-sync/weekly for status.",
        },
        { status: 202 },
      );
    }

    const report = await syncWeeklyMarket({
      skipOa: body.skipOa,
      forceOa: body.forceOa,
      skipAsks: body.skipAsks,
    });
    return NextResponse.json({ ok: report.status === "ok", report });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
