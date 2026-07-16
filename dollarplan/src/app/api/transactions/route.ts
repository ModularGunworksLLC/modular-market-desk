import { NextResponse } from "next/server";

import { getMonthSummary } from "@/lib/services/budget";
import {
  assignTransaction,
  createManualTransaction,
  listTransactionsForMonth,
} from "@/lib/services/transactions";
import { assignTransactionSchema, createTransactionSchema } from "@/lib/validation";

export async function GET(req: Request) {
  const monthId = Number(new URL(req.url).searchParams.get("monthId"));
  if (!Number.isFinite(monthId)) {
    return NextResponse.json({ error: "monthId required" }, { status: 400 });
  }
  const transactions = await listTransactionsForMonth(monthId);
  return NextResponse.json({ transactions });
}

export async function POST(req: Request) {
  const parsed = createTransactionSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const id = await createManualTransaction(parsed.data);
  return NextResponse.json({ id });
}

export async function PATCH(req: Request) {
  const url = new URL(req.url);
  const txnId = Number(url.searchParams.get("id"));
  if (!Number.isFinite(txnId)) {
    return NextResponse.json({ error: "id query param required" }, { status: 400 });
  }
  const parsed = assignTransactionSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  await assignTransaction(txnId, parsed.data.splits);
  const monthId = Number(url.searchParams.get("monthId"));
  if (Number.isFinite(monthId)) {
    const summary = await getMonthSummary(monthId);
    const transactions = await listTransactionsForMonth(monthId);
    return NextResponse.json({ summary, transactions });
  }
  return NextResponse.json({ ok: true });
}
