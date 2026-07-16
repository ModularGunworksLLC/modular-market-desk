import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { bootstrapTestDb, cleanupTestDb } from "@/test/test-db";

describe("budget service (integration)", () => {
  beforeAll(async () => {
    await bootstrapTestDb();
  });

  afterAll(async () => {
    await cleanupTestDb();
  });

  it("seeds household and starter lines for new month", async () => {
    const { getOrCreateMonth, getMonthSummary } = await import("@/lib/services/budget");
    const monthId = await getOrCreateMonth(2026, 6);
    const summary = await getMonthSummary(monthId);

    expect(summary).not.toBeNull();
    expect(summary!.year).toBe(2026);
    expect(summary!.month).toBe(6);
    expect(summary!.incomeLines.length).toBeGreaterThan(0);
    expect(summary!.budgetLines.length).toBeGreaterThanOrEqual(8);
    expect(summary!.plannedIncome).toBe(0);
    expect(summary!.balanced).toBe(true);
  });

  it("computes left to budget after line updates", async () => {
    const { db, schema } = await import("@/lib/db");
    const { getOrCreateMonth, getMonthSummary } = await import("@/lib/services/budget");
    const { budgetLines, incomeLines } = schema;

    const monthId = await getOrCreateMonth(2026, 7);
    await db.delete(incomeLines).where(eq(incomeLines.monthId, monthId));
    await db.delete(budgetLines).where(eq(budgetLines.monthId, monthId));

    await db.insert(incomeLines).values([
      { monthId, name: "Paycheck", plannedAmount: 5000, sortOrder: 0 },
    ]);
    await db.insert(budgetLines).values([
      { monthId, groupName: "Food", name: "Groceries", plannedAmount: 800, sortOrder: 0 },
      { monthId, groupName: "Bills", name: "Rent", plannedAmount: 4200, sortOrder: 1 },
    ]);

    const summary = await getMonthSummary(monthId);
    expect(summary!.plannedIncome).toBe(5000);
    expect(summary!.plannedExpenses).toBe(5000);
    expect(summary!.leftToBudget).toBe(0);
    expect(summary!.balanced).toBe(true);
  });

  it("copyMonthFromPrevious clones lines from prior month", async () => {
    const { db, schema } = await import("@/lib/db");
    const { copyMonthFromPrevious, getOrCreateMonth, getMonthSummary } = await import(
      "@/lib/services/budget"
    );
    const { budgetLines, incomeLines } = schema;

    const juneId = await getOrCreateMonth(2026, 6);
    await db.delete(incomeLines).where(eq(incomeLines.monthId, juneId));
    await db.delete(budgetLines).where(eq(budgetLines.monthId, juneId));
    await db.insert(incomeLines).values({ monthId: juneId, name: "Salary", plannedAmount: 6000, sortOrder: 0 });
    await db.insert(budgetLines).values({
      monthId: juneId,
      groupName: "Food",
      name: "Groceries",
      plannedAmount: 900,
      sortOrder: 0,
    });

    const julyId = await getOrCreateMonth(2026, 7);
    await copyMonthFromPrevious(julyId);

    const july = await getMonthSummary(julyId);
    expect(july!.incomeLines[0]?.name).toBe("Salary");
    expect(july!.incomeLines[0]?.plannedAmount).toBe(6000);
    expect(july!.budgetLines.some((l) => l.name === "Groceries" && l.plannedAmount === 900)).toBe(true);
  });
});
