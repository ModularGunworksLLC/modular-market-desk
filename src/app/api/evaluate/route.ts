/**
 * POST /api/evaluate
 * Runs the two-avenue arbitrage evaluation (wholesale cross-reference + GunBroker
 * Analytics market comps), computes Route A / Route B leakage, GO/NO-GO, and Max
 * Bid, then persists the valuation. Orchestration lives in the shared pipeline so
 * the batch buy-sheet stays in lock-step with single-deal math.
 */

import { NextResponse } from "next/server";

import { errorMessage } from "@/lib/api-error";
import { EvaluationError, runEvaluation } from "@/lib/evaluate-pipeline";
import { evaluateSchema } from "@/lib/validation";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request): Promise<NextResponse> {
  const json = await request.json().catch(() => null);
  const parsed = evaluateSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const output = await runEvaluation(parsed.data);
    return NextResponse.json(output);
  } catch (err) {
    if (err instanceof EvaluationError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: errorMessage(err) }, { status: 500 });
  }
}
