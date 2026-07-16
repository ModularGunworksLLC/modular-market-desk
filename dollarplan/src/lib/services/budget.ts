import { and, asc, desc, eq, sql } from "drizzle-orm";

import { isBalancedMonth, leftToBudget, lineRemaining, spentByLine, sumAmounts } from "@/lib/budget/math";
import { db, schema } from "@/lib/db";
import { DEFAULT_HOUSEHOLD_ID } from "@/lib/household";

const { budgetLines, budgetMonths, households, incomeLines, transactionSplits, transactions } =
  schema;

export type BudgetLineView = {
  id: number;
  groupName: string;
  name: string;
  plannedAmount: number;
  dueDay: number | null;
  isSinkingFund: boolean;
  isFavorite: boolean;
  spent: number;
  remaining: number;
};

export type MonthSummary = {
  id: number;
  year: number;
  month: number;
  plannedIncome: number;
  plannedExpenses: number;
  leftToBudget: number;
  balanced: boolean;
  incomeLines: (typeof incomeLines.$inferSelect)[];
  budgetLines: BudgetLineView[];
};

export async function ensureHousehold(): Promise<number> {
  const existing = await db.query.households.findFirst({
    where: eq(households.id, DEFAULT_HOUSEHOLD_ID),
  });
  if (existing) return existing.id;

  const [row] = await db
    .insert(households)
    .values({ id: DEFAULT_HOUSEHOLD_ID, name: "Home" })
    .returning();
  if (!row) throw new Error("Failed to seed household.");
  return row.id;
}

export async function getOrCreateMonth(year: number, month: number): Promise<number> {
  await ensureHousehold();
  const found = await db.query.budgetMonths.findFirst({
    where: and(
      eq(budgetMonths.householdId, DEFAULT_HOUSEHOLD_ID),
      eq(budgetMonths.year, year),
      eq(budgetMonths.month, month),
    ),
  });
  if (found) return found.id;

  const [row] = await db
    .insert(budgetMonths)
    .values({ householdId: DEFAULT_HOUSEHOLD_ID, year, month })
    .returning();
  if (!row) throw new Error("Failed to create budget month.");

  await seedStarterLines(row.id);
  return row.id;
}

async function seedStarterLines(monthId: number): Promise<void> {
  await db.insert(incomeLines).values([
    { monthId, name: "Paycheck", plannedAmount: 0, sortOrder: 0 },
  ]);

  const starters: (typeof budgetLines.$inferInsert)[] = [
    { monthId, groupName: "Giving", name: "Giving", plannedAmount: 0, sortOrder: 0 },
    { monthId, groupName: "Saving", name: "Emergency Fund", plannedAmount: 0, isSinkingFund: true, sortOrder: 1 },
    { monthId, groupName: "Housing", name: "Mortgage / Rent", plannedAmount: 0, sortOrder: 2 },
    { monthId, groupName: "Housing", name: "Utilities", plannedAmount: 0, sortOrder: 3 },
    { monthId, groupName: "Food", name: "Groceries", plannedAmount: 0, sortOrder: 4 },
    { monthId, groupName: "Food", name: "Restaurants", plannedAmount: 0, sortOrder: 5 },
    { monthId, groupName: "Transportation", name: "Gas", plannedAmount: 0, sortOrder: 6 },
    { monthId, groupName: "Personal", name: "Miscellaneous", plannedAmount: 0, sortOrder: 7 },
  ];
  await db.insert(budgetLines).values(starters);
}

export async function getMonthSummary(monthId: number): Promise<MonthSummary | null> {
  const month = await db.query.budgetMonths.findFirst({
    where: eq(budgetMonths.id, monthId),
  });
  if (!month) return null;

  const incomes = await db.query.incomeLines.findMany({
    where: eq(incomeLines.monthId, monthId),
    orderBy: asc(incomeLines.sortOrder),
  });
  const lines = await db.query.budgetLines.findMany({
    where: eq(budgetLines.monthId, monthId),
    orderBy: asc(budgetLines.sortOrder),
  });

  const splits = await db
    .select({
      budgetLineId: transactionSplits.budgetLineId,
      amount: transactionSplits.amount,
    })
    .from(transactionSplits)
    .innerJoin(transactions, eq(transactions.id, transactionSplits.transactionId))
    .where(and(eq(transactions.monthId, monthId), eq(transactions.pending, false)));

  const spendMap = new Map(spentByLine(splits).map((s) => [s.budgetLineId, s.spent]));

  const plannedIncome = sumAmounts(incomes.map((i) => i.plannedAmount));
  const plannedExpenses = sumAmounts(lines.map((l) => l.plannedAmount));
  const left = leftToBudget(plannedIncome, plannedExpenses);

  const budgetLineViews: BudgetLineView[] = lines.map((l) => {
    const spent = spendMap.get(l.id) ?? 0;
    return {
      id: l.id,
      groupName: l.groupName,
      name: l.name,
      plannedAmount: l.plannedAmount,
      dueDay: l.dueDay,
      isSinkingFund: l.isSinkingFund,
      isFavorite: l.isFavorite,
      spent,
      remaining: lineRemaining(l.plannedAmount, spent),
    };
  });

  return {
    id: month.id,
    year: month.year,
    month: month.month,
    plannedIncome,
    plannedExpenses,
    leftToBudget: left,
    balanced: isBalancedMonth(plannedIncome, plannedExpenses),
    incomeLines: incomes,
    budgetLines: budgetLineViews,
  };
}

export async function copyMonthFromPrevious(targetMonthId: number): Promise<void> {
  const target = await db.query.budgetMonths.findFirst({
    where: eq(budgetMonths.id, targetMonthId),
  });
  if (!target) throw new Error("Month not found.");

  const prev = await db.query.budgetMonths.findFirst({
    where: and(
      eq(budgetMonths.householdId, target.householdId),
      sql`(${budgetMonths.year} * 12 + ${budgetMonths.month}) < (${target.year} * 12 + ${target.month})`,
    ),
    orderBy: desc(sql`${budgetMonths.year} * 12 + ${budgetMonths.month}`),
  });
  if (!prev) return;

  const prevIncomes = await db.query.incomeLines.findMany({
    where: eq(incomeLines.monthId, prev.id),
  });
  const prevLines = await db.query.budgetLines.findMany({
    where: eq(budgetLines.monthId, prev.id),
  });

  await db.delete(incomeLines).where(eq(incomeLines.monthId, targetMonthId));
  await db.delete(budgetLines).where(eq(budgetLines.monthId, targetMonthId));

  if (prevIncomes.length > 0) {
    await db.insert(incomeLines).values(
      prevIncomes.map((i) => ({
        monthId: targetMonthId,
        name: i.name,
        plannedAmount: i.plannedAmount,
        payDay: i.payDay,
        sortOrder: i.sortOrder,
      })),
    );
  }

  if (prevLines.length > 0) {
    await db.insert(budgetLines).values(
      prevLines.map((l) => ({
        monthId: targetMonthId,
        groupName: l.groupName,
        name: l.name,
        plannedAmount: l.plannedAmount,
        dueDay: l.dueDay,
        isSinkingFund: l.isSinkingFund,
        isFavorite: l.isFavorite,
        sortOrder: l.sortOrder,
      })),
    );
  }
}

export async function listRecentMonths(limit = 12) {
  await ensureHousehold();
  return db.query.budgetMonths.findMany({
    where: eq(budgetMonths.householdId, DEFAULT_HOUSEHOLD_ID),
    orderBy: desc(sql`${budgetMonths.year} * 12 + ${budgetMonths.month}`),
    limit,
  });
}
