import { describe, expect, it } from "vitest";

import {
  catalogGroupKey,
  effectiveDealerPrice,
  groupCatalogOffers,
  normalizeCatalogUpc,
  parseCatalogSearchParams,
  pickBestOffer,
  type CatalogOfferInput,
} from "./catalog-search";

function row(partial: Partial<CatalogOfferInput> & Pick<CatalogOfferInput, "id" | "vendorName">): CatalogOfferInput {
  return {
    sku: null,
    upc: null,
    manufacturer: "Ruger",
    model: "10/22",
    caliber: "22 LR",
    category: "Rifle",
    description: "Ruger 10/22 Carbine",
    dealerPrice: 200,
    salePrice: null,
    onSale: false,
    qty: 5,
    inStock: true,
    ...partial,
  };
}

describe("normalizeCatalogUpc", () => {
  it("strips non-digits and accepts GTIN lengths", () => {
    expect(normalizeCatalogUpc("764-503-047111")).toBe("764503047111");
    expect(normalizeCatalogUpc("123")).toBeNull();
    expect(normalizeCatalogUpc(null)).toBeNull();
  });
});

describe("effectiveDealerPrice", () => {
  it("uses dealer price by default", () => {
    expect(effectiveDealerPrice({ dealerPrice: 199.99 })).toBe(199.99);
  });

  it("prefers sale when on sale and cheaper", () => {
    expect(
      effectiveDealerPrice({ dealerPrice: 200, salePrice: 175, onSale: true }),
    ).toBe(175);
  });

  it("ignores sale when not cheaper or not on sale", () => {
    expect(
      effectiveDealerPrice({ dealerPrice: 200, salePrice: 210, onSale: true }),
    ).toBe(200);
    expect(
      effectiveDealerPrice({ dealerPrice: 200, salePrice: 150, onSale: false }),
    ).toBe(200);
  });
});

describe("catalogGroupKey", () => {
  it("prefers UPC grouping", () => {
    expect(
      catalogGroupKey({
        upc: "764503047111",
        manufacturer: "Ruger",
        model: "10/22",
      }),
    ).toBe("upc:764503047111");
  });

  it("falls back to manufacturer|model|caliber", () => {
    expect(
      catalogGroupKey({
        upc: null,
        manufacturer: "Ruger",
        model: "10/22",
        caliber: "22 LR",
      }),
    ).toBe("id:RUGER|10 22|22 LR");
  });
});

describe("groupCatalogOffers", () => {
  it("collapses same UPC across vendors and ranks by best in-stock price", () => {
    const groups = groupCatalogOffers([
      row({
        id: "1",
        vendorName: "lipseys",
        upc: "764503047111",
        dealerPrice: 220,
        inStock: true,
      }),
      row({
        id: "2",
        vendorName: "zanders",
        upc: "764503047111",
        dealerPrice: 199,
        inStock: true,
      }),
      row({
        id: "3",
        vendorName: "davidsons",
        upc: "764503047111",
        dealerPrice: 180,
        inStock: false,
      }),
    ]);

    expect(groups).toHaveLength(1);
    const g = groups[0]!;
    expect(g.vendorCount).toBe(3);
    expect(g.bestOffer.vendorName).toBe("zanders");
    expect(g.bestOffer.effectivePrice).toBe(199);
    expect(g.offers[0]!.vendorName).toBe("davidsons"); // sorted by price ascending
  });

  it("uses sale price for ranking when on sale", () => {
    const groups = groupCatalogOffers([
      row({
        id: "1",
        vendorName: "lipseys",
        upc: "111111111111",
        dealerPrice: 200,
        salePrice: 150,
        onSale: true,
        inStock: true,
      }),
      row({
        id: "2",
        vendorName: "zanders",
        upc: "111111111111",
        dealerPrice: 175,
        inStock: true,
      }),
    ]);
    expect(groups[0]!.bestOffer.vendorName).toBe("lipseys");
    expect(groups[0]!.bestOffer.effectivePrice).toBe(150);
  });

  it("groups by mfr+model when UPC missing", () => {
    const groups = groupCatalogOffers([
      row({ id: "1", vendorName: "orion", upc: null, dealerPrice: 50, description: "BCG" }),
      row({ id: "2", vendorName: "chattanooga", upc: null, dealerPrice: 45, description: "BCG" }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.groupKey.startsWith("id:")).toBe(true);
    expect(groups[0]!.bestOffer.vendorName).toBe("chattanooga");
  });
});

describe("pickBestOffer", () => {
  it("prefers in-stock even if slightly higher", () => {
    const offers = groupCatalogOffers([
      row({ id: "1", vendorName: "a", upc: "222222222222", dealerPrice: 100, inStock: false }),
      row({ id: "2", vendorName: "b", upc: "222222222222", dealerPrice: 110, inStock: true }),
    ])[0]!.offers;
    const best = pickBestOffer(offers);
    expect(best.vendorName).toBe("b");
  });
});

describe("parseCatalogSearchParams", () => {
  it("parses filters and booleans from the query string", () => {
    const parsed = parseCatalogSearchParams(
      new URL("https://desk.local/api/catalogs/search?q=BCG&vendor=lipseys&category=Parts&inStockOnly=1&limit=25"),
    );
    expect(parsed).toEqual({
      q: "BCG",
      vendor: "lipseys",
      category: "Parts",
      inStockOnly: true,
      limit: 25,
    });
  });

  it("defaults empty vendor/category and invalid limit", () => {
    const parsed = parseCatalogSearchParams(new URL("https://desk.local/api/catalogs/search?limit=nope"));
    expect(parsed.vendor).toBeUndefined();
    expect(parsed.category).toBeUndefined();
    expect(parsed.inStockOnly).toBe(false);
    expect(parsed.limit).toBe(40);
  });
});
