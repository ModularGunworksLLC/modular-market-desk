import { describe, expect, it } from "vitest";

import { formatMoney, monthLabel } from "./format";

describe("formatMoney", () => {
  it("formats positive amounts", () => {
    expect(formatMoney(1234.5)).toBe("$1,234.50");
  });

  it("formats negative amounts", () => {
    expect(formatMoney(-87.42)).toBe("-$87.42");
  });

  it("formats zero", () => {
    expect(formatMoney(0)).toBe("$0.00");
  });
});

describe("monthLabel", () => {
  it("returns long month and year", () => {
    expect(monthLabel(2026, 6)).toBe("June 2026");
  });
});
