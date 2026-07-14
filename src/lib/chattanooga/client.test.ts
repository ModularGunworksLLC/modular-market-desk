import { describe, expect, it } from "vitest";

import { mapChattanoogaItem, resolveDealerPrice } from "./client";

describe("resolveDealerPrice", () => {
  it("prefers explicit dealer_price over retail_price", () => {
    expect(
      resolveDealerPrice({
        dealer_price: 412.5,
        retail_price: 599,
        map_price: 549,
      }),
    ).toBe(412.5);
  });

  it("falls back to retail_price when no dealer field", () => {
    expect(resolveDealerPrice({ retail_price: "389.99" })).toBe(389.99);
  });
});

describe("mapChattanoogaItem", () => {
  it("maps a typical CSSI firearm row", () => {
    const row = mapChattanoogaItem({
      cssi_id: "GL19557",
      upc_code: "764503026542",
      name: "GLOCK 19 Gen5 9mm",
      brand: "GLOCK",
      department: "Handguns",
      caliber: "9mm",
      retail_price: 499,
      map_price: 539,
      inventory: 3,
      in_stock_flag: 1,
    });
    expect(row).toMatchObject({
      sku: "GL19557",
      upc: "764503026542",
      manufacturer: "GLOCK",
      dealerPrice: 499,
      mapPrice: 539,
      qty: 3,
      inStock: true,
      category: "Handguns",
    });
  });

  it("skips rows with no price or identity", () => {
    expect(mapChattanoogaItem({ name: "Widget", retail_price: 0 })).toBeNull();
    expect(mapChattanoogaItem({ retail_price: 10 })).toBeNull();
  });
});
