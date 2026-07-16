import { NextResponse } from "next/server";

import { currentYearMonth } from "@/lib/format";
import { getMonthSummary, getOrCreateMonth, listRecentMonths } from "@/lib/services/budget";
import { monthQuerySchema } from "@/lib/validation";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const parsed = monthQuerySchema.safeParse({
    year: url.searchParams.get("year") ?? undefined,
    month: url.searchParams.get("month") ?? undefined,
  });

  const { year, month } =
    parsed.success && parsed.data.year && parsed.data.month
      ? { year: parsed.data.year, month: parsed.data.month }
      : currentYearMonth();

  const monthId = await getOrCreateMonth(year, month);
  const summary = await getMonthSummary(monthId);
  const recent = await listRecentMonths();

  return NextResponse.json({ summary, recent });
}
