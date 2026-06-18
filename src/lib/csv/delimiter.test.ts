import { describe, expect, it } from "vitest";

import { detectDelimiter } from "./delimiter";

describe("detectDelimiter", () => {
  it("prefers tab when the header line is TSV", () => {
    const line = "Item Number\tUPC\tDealer Price\tQty";
    expect(detectDelimiter(line)).toBe("\t");
  });

  it("prefers comma for standard CSV", () => {
    const line = "Item Number,UPC,Dealer Price,Qty";
    expect(detectDelimiter(line)).toBe(",");
  });
});
