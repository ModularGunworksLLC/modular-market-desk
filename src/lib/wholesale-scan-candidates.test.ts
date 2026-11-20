import { describe, expect, it } from "vitest";

import { pickScanCandidates, scanIdentityKey, type ScanCatalogRow } from "./wholesale-scan-candidates";

function gun(over: Partial<ScanCatalogRow> & Pick<ScanCatalogRow, "vendorName" | "dealerPrice">): ScanCatalogRow {
  return {
    sku: "SKU",
    upc: "764503026187",
    manufacturer: "Glock",
    model: "19",
    description: "GLK 19G5 9MM PST 15RD",
    category: "Handguns",
    caliber: "9mm",
    inStock: true,
    ...over,
  };
}

describe("wholesale scan candidates", () => {
  it("keeps the cheapest vendor for the same UPC", () => {
    const picked = pickScanCandidates(
      [
        gun({ vendorName: "lipseys", dealerPrice: 489 }),
        gun({ vendorName: "2ndamendmentwholesale", dealerPrice: 455, sku: "2AW" }),
        gun({ vendorName: "zanders", dealerPrice: 470 }),
      ],
      10,
    );
    expect(picked).toHaveLength(1);
    expect(picked[0]?.r.vendorName).toBe("2ndamendmentwholesale");
    expect(picked[0]?.r.dealerPrice).toBe(455);
  });

  it("treats dashed UPCs as the same gun", () => {
    expect(scanIdentityKey({ upc: "764503026187", manufacturer: "Glock", model: "19" })).toBe(
      scanIdentityKey({ upc: "764-503-026187", manufacturer: "Glock", model: "19" }),
    );
  });

  it("drops accessories even when in stock", () => {
    const picked = pickScanCandidates(
      [
        {
          vendorName: "lipseys",
          sku: "PIN",
          upc: "111111111111",
          manufacturer: "Glock",
          model: "33193",
          description: "Firing Pin Safety",
          category: "Parts",
          caliber: null,
          dealerPrice: 12,
          inStock: true,
        },
        gun({ vendorName: "lipseys", dealerPrice: 455 }),
      ],
      10,
    );
    expect(picked).toHaveLength(1);
    expect(picked[0]?.r.description).toContain("GLK 19G5");
  });

  it("caps at the evaluate limit after cheapest-source dedupe", () => {
    const rows = Array.from({ length: 5 }, (_, i) =>
      gun({
        vendorName: "lipseys",
        upc: `76450302618${i}`,
        dealerPrice: 400 + i,
        sku: `S${i}`,
      }),
    );
    expect(pickScanCandidates(rows, 2)).toHaveLength(2);
  });
});
