import { describe, expect, it } from "vitest";

import {
  isAccessoryOrPart,
  isDisplayFirearm,
  isLikelyFirearm,
  modelMatchesQuery,
  rowHasVariantNotInQuery,
  isUpcCatalogFirearm,
  scoreWholesaleRow,
} from "./wholesale-match";
import { filterTextMatchesByPrice } from "./wholesale-match";

describe("wholesale match", () => {
  it("rejects SKU substring false positives for Glock 19", () => {
    const part = {
      manufacturer: "Glock Inc.",
      model: "33193",
      description: "Firing Pin Safety - Slim .380 G42",
      category: "Parts",
    };
    expect(modelMatchesQuery(part, { manufacturer: "Glock", model: "19" })).toBe(false);
    expect(scoreWholesaleRow(part, { manufacturer: "Glock", model: "19" })).toBeLessThan(50);
  });

  it("accepts Glock 19 pistol descriptions", () => {
    const pistol = {
      manufacturer: "Glock",
      model: "19",
      description: "GLK 19G5 9MM PST 15RD FSS FS",
      category: "Handguns",
    };
    expect(modelMatchesQuery(pistol, { manufacturer: "Glock", model: "19" })).toBe(true);
    expect(isLikelyFirearm(pistol)).toBe(true);
    expect(scoreWholesaleRow(pistol, { manufacturer: "Glock", model: "19", caliber: "9mm" })).toBeGreaterThan(
      70,
    );
  });

  it("rejects 10/22 scope bases", () => {
    const base = {
      manufacturer: "Ruger",
      model: "33193",
      description: "Weaver-Style Aluminum Combination 10/22 Rifle Scope Base Adapter",
      category: "Parts",
      dealerPrice: 6.49,
    };
    expect(modelMatchesQuery(base, { manufacturer: "Ruger", model: "10/22" })).toBe(false);
    expect(scoreWholesaleRow(base, { manufacturer: "Ruger", model: "10/22", category: "rifle" })).toBeLessThan(50);
  });

  it("accepts 10/22 carbine lines", () => {
    const rifle = {
      manufacturer: "Ruger",
      model: "10/22 CARBINE",
      description: "10/22 CARBINE 22 LR AUTOLOADING RIFLE 18.5 BBL",
      category: "Rifles",
      dealerPrice: 199,
    };
    expect(scoreWholesaleRow(rifle, { manufacturer: "Ruger", model: "10/22", category: "rifle" })).toBeGreaterThan(70);
  });

  it("does not match PDP F to PDP Full Size (substring trap)", () => {
    const full = {
      manufacturer: "Walther",
      model: "PDP Full Size",
      description: null,
      category: "Semi-Auto Pistol",
      dealerPrice: 529,
    };
    const query = { manufacturer: "Walther", model: "PDP F", caliber: "9mm", category: "handgun" };
    expect(modelMatchesQuery(full, query)).toBe(false);
    expect(scoreWholesaleRow(full, query)).toBeLessThan(50);
  });

  it("UPC path accepts PRO E row when query model is abbreviated PDP F", () => {
    const pro = {
      manufacturer: "Walther",
      model: "PDP PRO E F-Series",
      description: null,
      category: "Semi-Auto Pistol",
      dealerPrice: 699,
    };
    const query = { manufacturer: "Walther", model: "PDP F", caliber: "9mm", category: "handgun" };
    expect(isDisplayFirearm(pro, query)).toBe(false);
    expect(isUpcCatalogFirearm(pro, query)).toBe(true);
  });

  it("rejects PRO variant when query omits PRO", () => {
    const pro = {
      manufacturer: "Walther",
      model: "PDP PRO E F-Series",
      description: null,
      category: "Semi-Auto Pistol",
      dealerPrice: 699,
    };
    const query = { manufacturer: "Walther", model: "PDP F", caliber: "9mm" };
    expect(rowHasVariantNotInQuery(query, pro)).toBe(true);
    expect(modelMatchesQuery(pro, query)).toBe(false);
  });

  it("penalizes magazines", () => {
    const mag = {
      manufacturer: "Glock",
      model: "GLK MAG 19G5 9MM 15RD",
      description: "GLK MAG 19G5 9MM 15RD",
      category: null,
    };
    expect(isAccessoryOrPart(mag)).toBe(true);
    expect(scoreWholesaleRow(mag, { manufacturer: "Glock", model: "19" })).toBeLessThan(50);
  });
});

describe("filterTextMatchesByPrice", () => {
  it("clears matches when floor is far below dealer cost", () => {
    const matches = [
      {
        vendorName: "lipseys",
        sku: null,
        upc: null,
        manufacturer: "Walther",
        model: "PDP F-Series",
        productLabel: "PDP F-Series",
        dealerPrice: 529,
        inStock: true,
        cheaperThanTarget: true,
        isFirearm: true,
      },
    ];
    const { matches: out, warning } = filterTextMatchesByPrice(matches, 699);
    expect(out).toHaveLength(0);
    expect(warning).toMatch(/UPC/i);
  });
});
