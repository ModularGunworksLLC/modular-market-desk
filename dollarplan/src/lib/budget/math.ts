/** Round to cents at display/persist boundaries only. */
export function round2(x: number): number {
  return Math.round((x + Number.EPSILON) * 100) / 100;
}

export function sumAmounts(values: number[]): number {
  return round2(values.reduce((a, b) => a + b, 0));
}

export function leftToBudget(plannedIncome: number, plannedExpenses: number): number {
  return round2(plannedIncome - plannedExpenses);
}

export function lineRemaining(planned: number, spent: number): number {
  return round2(planned - spent);
}

export function isBalancedMonth(plannedIncome: number, plannedExpenses: number): boolean {
  return leftToBudget(plannedIncome, plannedExpenses) === 0;
}

export type LineSpend = { budgetLineId: number; spent: number };

export function spentByLine(splits: { budgetLineId: number; amount: number }[]): LineSpend[] {
  const map = new Map<number, number>();
  for (const s of splits) {
    map.set(s.budgetLineId, round2((map.get(s.budgetLineId) ?? 0) + s.amount));
  }
  return [...map.entries()].map(([budgetLineId, spent]) => ({ budgetLineId, spent }));
}
