import { describe, expect, it } from "vitest";

import {
  dedupeKeyForRow,
  extractCsvUrls,
  extractProductRecords,
  normalizeCatalogRow,
} from "./rows";

describe("normalizeCatalogRow", () => {
  it("maps Lipsey's CatalogFeed fields", () => {
    const row = normalizeCatalogRow({
      itemNo: "ABC123",
      upc: "123456789012",
      manufacturer: "GLOCK",
      model: "G19 Gen5",
      description1: "GLOCK 19 Gen5 9mm",
      caliberGauge: "9mm",
      type: "Pistol",
      currentPrice: 449.5,
      price: 469,
      msrp: 599,
      retailMap: 549,
      quantity: 12,
      onSale: true,
    });
    expect(row).toMatchObject({
      sku: "ABC123",
      upc: "123456789012",
      manufacturer: "GLOCK",
      model: "G19 Gen5",
      dealerPrice: 449.5,
      qty: 12,
      onSale: true,
    });
    expect(dedupeKeyForRow(row!)).toBe("123456789012");
  });

  it("skips rows without a usable price", () => {
    expect(
      normalizeCatalogRow({
        sku: "X",
        manufacturer: "GLOCK",
        model: "19",
      }),
    ).toBeNull();
  });

  it("prefers sale price when cheaper than dealer", () => {
    const row = normalizeCatalogRow({
      sku: "S1",
      manufacturer: "Smith",
      model: "M&P",
      dealerPrice: 400,
      salePrice: 350,
    });
    expect(row?.dealerPrice).toBe(350);
    expect(row?.onSale).toBe(true);
  });
});

describe("extractProductRecords / extractCsvUrls", () => {
  it("pulls products from nested envelopes", () => {
    const records = extractProductRecords({
      data: { items: [{ sku: "1", price: 10 }] },
    });
    expect(records).toHaveLength(1);
    expect(records[0]?.sku).toBe("1");
  });

  it("collects csv download urls", () => {
    const urls = extractCsvUrls({
      csvDownloadUrls: ["https://example.com/inv.csv", { url: "https://example.com/b.tsv" }],
      links: ["https://ignore.me/page"],
    });
    expect(urls).toEqual(["https://example.com/inv.csv", "https://example.com/b.tsv"]);
  });
});
