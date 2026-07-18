import { describe, expect, it } from "vitest";

import { parseIdentityFromTitle, parsePriceFromText } from "./parse-title";

describe("parseIdentityFromTitle", () => {
  it("extracts common makes", () => {
    expect(parseIdentityFromTitle("Glock 19 Gen5 9mm $450")).toEqual({
      manufacturer: "Glock",
      model: "19 Gen5",
    });
    expect(parseIdentityFromTitle("Sig Sauer P320 Compact")).toMatchObject({
      manufacturer: "Sig Sauer",
    });
  });
});

describe("parsePriceFromText", () => {
  it("reads dollar amounts", () => {
    expect(parsePriceFromText("FS Ruger $275 PU")).toBe(275);
    expect(parsePriceFromText("too cheap $20")).toBeNull();
  });
});
