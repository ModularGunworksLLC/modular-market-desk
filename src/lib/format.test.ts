import { describe, expect, it } from "vitest";

import { parseMoneyField, parseMoneyFieldOrZero, usd } from "./format";

describe("parseMoneyField", () => {
  it("returns null for empty or garbage", () => {
    expect(parseMoneyField("")).toBeNull();
    expect(parseMoneyField("  ")).toBeNull();
    expect(parseMoneyField("abc")).toBeNull();
  });
  it("parses plain and comma numbers", () => {
    expect(parseMoneyField("420")).toBe(420);
    expect(parseMoneyField("1,234.56")).toBe(1234.56);
  });
  it("parseMoneyFieldOrZero fails soft to 0", () => {
    expect(parseMoneyFieldOrZero("")).toBe(0);
    expect(parseMoneyFieldOrZero("18")).toBe(18);
  });
});

describe("usd", () => {
  it("formats currency", () => {
    expect(usd(399)).toMatch(/\$399/);
    expect(usd(null)).toBe("—");
  });
});
