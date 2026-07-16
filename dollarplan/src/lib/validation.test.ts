import { describe, expect, it } from "vitest";

import {
  assignTransactionSchema,
  budgetLineSchema,
  createTransactionSchema,
  monthQuerySchema,
  updateMonthSchema,
} from "./validation";

describe("monthQuerySchema", () => {
  it("coerces year and month from strings", () => {
    expect(monthQuerySchema.parse({ year: "2026", month: "6" })).toEqual({
      year: 2026,
      month: 6,
    });
  });

  it("rejects invalid month", () => {
    expect(monthQuerySchema.safeParse({ month: 13 }).success).toBe(false);
  });
});

describe("createTransactionSchema", () => {
  it("accepts valid manual spend", () => {
    const parsed = createTransactionSchema.parse({
      monthId: 1,
      date: "2026-06-22",
      amount: -42.5,
      payee: "Kroger",
    });
    expect(parsed.payee).toBe("Kroger");
  });

  it("rejects positive amounts", () => {
    expect(
      createTransactionSchema.safeParse({
        monthId: 1,
        date: "2026-06-22",
        amount: 42,
        payee: "Refund",
      }).success,
    ).toBe(false);
  });

  it("rejects bad date format", () => {
    expect(
      createTransactionSchema.safeParse({
        monthId: 1,
        date: "06/22/2026",
        amount: -10,
        payee: "Store",
      }).success,
    ).toBe(false);
  });
});

describe("assignTransactionSchema", () => {
  it("requires positive split amounts", () => {
    expect(
      assignTransactionSchema.safeParse({
        splits: [{ budgetLineId: 1, amount: 0 }],
      }).success,
    ).toBe(false);
  });
});

describe("updateMonthSchema", () => {
  it("accepts full month payload", () => {
    const parsed = updateMonthSchema.parse({
      incomeLines: [{ name: "Paycheck", plannedAmount: 5000 }],
      budgetLines: [
        { groupName: "Food", name: "Groceries", plannedAmount: 800 },
      ],
    });
    expect(parsed.incomeLines).toHaveLength(1);
    expect(parsed.budgetLines).toHaveLength(1);
  });

  it("rejects empty budget line name", () => {
    expect(
      updateMonthSchema.safeParse({
        incomeLines: [],
        budgetLines: [{ groupName: "Food", name: "", plannedAmount: 0 }],
      }).success,
    ).toBe(false);
  });
});

describe("budgetLineSchema", () => {
  it("allows nullable dueDay", () => {
    expect(budgetLineSchema.parse({ groupName: "Bills", name: "Rent", plannedAmount: 1200, dueDay: null }).dueDay).toBeNull();
  });
});
