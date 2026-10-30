/**
 * POST /api/batch
 * Evaluate a whole auction sheet at once. Streams NDJSON so the buy-sheet fills in
 * live, runs a small concurrency pool to be polite to the GunBroker Analytics API,
 * and reuses the exact single-deal pipeline for every lot.
 *
 * Request:  { rows: BatchEvalRow[], defaults: {...} }
 * Response: newline-delimited JSON — one `{type:"meta"}`, then `{type:"result"}`
 *           per lot, then a final `{type:"done"}`.
 */

import { z } from "zod";

import {
  batchDefaultsSchema,
  batchRowSchema,
  evaluateBatchRow,
} from "@/lib/batch/evaluate-row";
import { GbaApiClient, GbaApiError } from "@/lib/gba/client";
import { liveOaUnavailableBanner } from "@/lib/oa/live-label";
import { oaExpiryWarnMs } from "@/lib/oa/config";
import { liveTokenBlocked, resolveOaState } from "@/lib/oa/status";
import { loadOaVault, markOaProbeOk, markOaUnauthorized, type OaVaultSnapshot } from "@/lib/oa/vault-store";

export const runtime = "nodejs";
export const maxDuration = 300;

const CONCURRENCY = 3;

const batchSchema = z.object({
  rows: z.array(batchRowSchema).min(1).max(500),
  defaults: batchDefaultsSchema,
});

export async function POST(request: Request): Promise<Response> {
  const json = await request.json().catch(() => null);
  const parsed = batchSchema.safeParse(json);
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: parsed.error.flatten() }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { rows, defaults } = parsed.data;
  let oaSnapshot = await loadOaVault();

  if (oaSnapshot.usableToken) {
    const token = oaSnapshot.usableToken;
    try {
      await new GbaApiClient(token).dependencies();
      await markOaProbeOk();
      oaSnapshot = await loadOaVault();
    } catch (err) {
      if (err instanceof GbaApiError && err.status === 401) {
        await markOaUnauthorized();
        oaSnapshot = await loadOaVault();
      }
    }
  }

  const oaNotice = oaSheetNotice(oaSnapshot);

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (obj: unknown) => controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
      send({
        type: "meta",
        total: rows.length,
        hasToken: Boolean(oaSnapshot.usableToken),
        oaLiveUnavailable: oaNotice.unavailable,
        oaBanner: oaNotice.banner,
      });

      let next = 0;
      let completed = 0;
      const tally = { go: 0, nogo: 0, noComps: 0, errored: 0 };
      const worker = async () => {
        while (next < rows.length) {
          const idx = next++;
          const row = rows[idx]!;
          const result = await evaluateBatchRow(row, defaults, oaSnapshot.usableToken, oaSnapshot);
          completed++;
          if (result.error) tally.errored++;
          else if (result.soldCount === 0) tally.noComps++;
          else if (result.verdict === "GO") tally.go++;
          else tally.nogo++;
          send({ type: "result", completed, row: result });
        }
      };

      const workers = Array.from({ length: Math.min(CONCURRENCY, rows.length) }, () => worker());
      await Promise.all(workers);
      send({
        type: "done",
        completed,
        tally,
        hasToken: Boolean(oaSnapshot.usableToken),
        oaLiveUnavailable: oaNotice.unavailable,
        oaBanner: oaNotice.banner,
      });
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
    },
  });
}

function oaSheetNotice(snap: OaVaultSnapshot): { unavailable: boolean; banner: string | null } {
  const state = resolveOaState({
    connected: snap.connected,
    status: snap.status,
    expiresAt: snap.expiresAt,
    lastProbeOk: snap.lastProbeOk,
    now: new Date(),
    warnWithinMs: oaExpiryWarnMs(),
  });
  const block = liveTokenBlocked(state);
  if (!block) return { unavailable: false, banner: null };
  return { unavailable: true, banner: liveOaUnavailableBanner(block, "cache", true) };
}
