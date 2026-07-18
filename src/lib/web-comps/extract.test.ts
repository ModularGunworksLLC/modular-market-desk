import { describe, expect, it } from "vitest";

import { domainFromUrl, extractPricesFromText } from "./extract";

describe("extractPricesFromText", () => {
  it("parses dollar amounts from snippets", () => {
    expect(extractPricesFromText("Glock 19 Gen5 — $549.99 in stock")).toEqual([549.99]);
    expect(extractPricesFromText("Sale $1,299 or $1299.00")).toEqual([1299, 1299]);
  });

  it("discards absurd firearm outliers", () => {
    expect(extractPricesFromText("Magazine $29.99 · Rifle $18999")).toEqual([]);
    expect(extractPricesFromText("Parts kit $12")).toEqual([]);
  });

  it("returns empty for no dollars", () => {
    expect(extractPricesFromText("No price listed")).toEqual([]);
  });
});

describe("domainFromUrl", () => {
  it("strips www and lowercases", () => {
    expect(domainFromUrl("https://www.Example.com/path")).toBe("example.com");
  });

  it("returns empty for bad urls", () => {
    expect(domainFromUrl("not-a-url")).toBe("");
  });
});
