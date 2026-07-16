import { describe, expect, it } from "vitest";

import {
  isBalancedMonth,
  leftToBudget,
  lineRemaining,
  round2,
  spentByLine,
  sumAmounts,
} from "./math";

describe("round2", () => {
  it("rounds to cents", () => {
    expect(round2(1.005)).toBe(1.01);
    expect(round2(1.004)).toBe(1);
    expect(round2(0)).toBe(0);
  });
});

describe("sumAmounts", () => {
  it("sums and rounds", () => {
    expect(sumAmounts([10.1, 20.2])).toBe(30.3);
    expect(sumAmounts([])).toBe(0);
  });
});

describe("leftToBudget", () => {
  it("subtracts expenses from income", () => {
    expect(leftToBudget(5000, 5000)).toBe(0);
    expect(leftToBudget(5000, 4800)).toBe(200);
    expect(leftToBudget(5000, 5200)).toBe(-200);
  });
});

describe("isBalancedMonth", () => {
  it("is true only at zero left", () => {
    expect(isBalancedMonth(5464, 5464)).toBe(true);
    expect(isBalancedMonth(5464, 5000)).toBe(false);
    expect(isBalancedMonth(5464, 5500)).toBe(false);
  });
});

describe("lineRemaining", () => {
  it("planned minus spent", () => {
    expect(lineRemaining(800, 412)).toBe(388);
    expect(lineRemaining(100, 150)).toBe(-50);
  });
});

describe("spentByLine", () => {
  it("aggregates splits by budget line", () => {
    const result = spentByLine([
      { budgetLineId: 1, amount: 40 },
      { budgetLineId: 2, amount: 12.5 },
      { budgetLineId: 1, amount: 10 },
    ]);
    expect(result).toEqual([
      { budgetLineId: 1, spent: 50 },
      { budgetLineId: 2, spent: 12.5 },
    ]);
  });

  it("returns empty for no splits", () => {
    expect(spentByLine([])).toEqual([]);
  });
});
