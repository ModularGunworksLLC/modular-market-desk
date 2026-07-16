import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db, schema } from "@/lib/db";
import { copyMonthFromPrevious, getMonthSummary } from "@/lib/services/budget";
import { updateMonthSchema } from "@/lib/validation";

type Params = { params: Promise<{ id: string }> };

const { budgetLines, incomeLines } = schema;

export async function GET(_req: Request, { params }: Params) {
  const { id } = await params;
  const monthId = Number(id);
  if (!Number.isFinite(monthId)) {
    return NextResponse.json({ error: "Invalid month id" }, { status: 400 });
  }
  const summary = await getMonthSummary(monthId);
  if (!summary) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ summary });
}

export async function PATCH(req: Request, { params }: Params) {
  const { id } = await params;
  const monthId = Number(id);
  if (!Number.isFinite(monthId)) {
    return NextResponse.json({ error: "Invalid month id" }, { status: 400 });
  }

  const parsed = updateMonthSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const data = parsed.data;
  await db.delete(incomeLines).where(eq(incomeLines.monthId, monthId));
  await db.delete(budgetLines).where(eq(budgetLines.monthId, monthId));

  if (data.incomeLines.length > 0) {
    await db.insert(incomeLines).values(
      data.incomeLines.map((line, i) => ({
        monthId,
        name: line.name,
        plannedAmount: line.plannedAmount,
        payDay: line.payDay ?? null,
        sortOrder: line.sortOrder ?? i,
      })),
    );
  }

  if (data.budgetLines.length > 0) {
    await db.insert(budgetLines).values(
      data.budgetLines.map((line, i) => ({
        monthId,
        groupName: line.groupName,
        name: line.name,
        plannedAmount: line.plannedAmount,
        dueDay: line.dueDay ?? null,
        isSinkingFund: line.isSinkingFund ?? false,
        isFavorite: line.isFavorite ?? false,
        sortOrder: line.sortOrder ?? i,
      })),
    );
  }

  const summary = await getMonthSummary(monthId);
  return NextResponse.json({ summary });
}

export async function POST(req: Request, { params }: Params) {
  const { id } = await params;
  const monthId = Number(id);
  if (!Number.isFinite(monthId)) {
    return NextResponse.json({ error: "Invalid month id" }, { status: 400 });
  }

  const url = new URL(req.url);
  if (url.searchParams.get("action") === "copy-previous") {
    await copyMonthFromPrevious(monthId);
    const summary = await getMonthSummary(monthId);
    return NextResponse.json({ summary });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
