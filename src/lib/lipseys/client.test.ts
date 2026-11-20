import { describe, expect, it } from "vitest";

import { LipseysApiError, mapLipseysCatalogItem, resolveLipseysDealerPrice, unwrapEnvelope } from "./client";

describe("resolveLipseysDealerPrice", () => {
  it("prefers currentPrice over list price (CSV CURRENTPRICE)", () => {
    expect(resolveLipseysDealerPrice({ currentPrice: 412.5, price: 449 })).toBe(412.5);
  });

  it("falls back to price when currentPrice is missing", () => {
    expect(resolveLipseysDealerPrice({ price: "389.99" })).toBe(389.99);
  });
});

describe("mapLipseysCatalogItem", () => {
  it("maps a typical firearm row (itemNo / UPC / model)", () => {
    const row = mapLipseysCatalogItem({
      itemNo: "RULCP",
      upc: "736676037018",
      manufacturerModelNo: "3701",
      manufacturer: "Ruger",
      model: "LCP",
      description1: "LCP .380 ACP",
      caliberGauge: ".380 ACP",
      type: "Pistol",
      itemType: "Handgun",
      msrp: 349,
      retailMap: 259,
      price: 229,
      currentPrice: 219.5,
      onSale: true,
      quantity: 4,
    });
    expect(row).toMatchObject({
      sku: "RULCP",
      upc: "736676037018",
      manufacturer: "Ruger",
      model: "LCP",
      caliber: ".380 ACP",
      category: "Pistol",
      dealerPrice: 219.5,
      msrp: 349,
      mapPrice: 259,
      salePrice: 219.5,
      onSale: true,
      qty: 4,
      inStock: true,
    });
  });

  it("treats qty 0 as out of stock and infers onSale from price gap", () => {
    const row = mapLipseysCatalogItem({
      itemNo: "GL19",
      upc: "764503026542",
      manufacturer: "GLOCK",
      model: "19",
      price: 500,
      currentPrice: 450,
      quantity: 0,
    });
    expect(row).toMatchObject({
      dealerPrice: 450,
      onSale: true,
      salePrice: 450,
      qty: 0,
      inStock: false,
    });
  });

  it("skips rows with no price or identity", () => {
    expect(mapLipseysCatalogItem({ manufacturer: "GLOCK", model: "19", currentPrice: 0 })).toBeNull();
    expect(mapLipseysCatalogItem({ currentPrice: 10 })).toBeNull();
  });
});

describe("unwrapEnvelope", () => {
  it("returns data on success", () => {
    expect(unwrapEnvelope({ success: true, authorized: true, errors: [], data: { qty: 1 } }, "x")).toEqual({
      qty: 1,
    });
  });

  it("throws when unauthorized", () => {
    expect(() =>
      unwrapEnvelope({ success: false, authorized: false, errors: ["bad token"] }, "ValidateItem"),
    ).toThrow(LipseysApiError);
  });
});
