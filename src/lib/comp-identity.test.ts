import { describe, expect, it } from "vitest";

import {
  filterAskingByIdentity,
  filterSoldByIdentity,
  titleContainsMpn,
  titleContainsUpc,
  titleConflictsCapacity,
} from "./comp-identity";
import type { AskingCompInput, SoldCompInput } from "./comp-filter";

const MAX9_12RD = {
  upc: "736676035236",
  mpn: "3523",
  catalogDescription: "Ruger MAX-9 9mm 12+1 ReadyDot",
};

describe("titleContainsUpc", () => {
  it("matches UPC digits embedded in listing title", () => {
    expect(titleContainsUpc("RUGER MAX-9 9MM UPC 736676035236 NEW", MAX9_12RD.upc)).toBe(true);
    expect(titleContainsUpc("RUGER MAX-9 9MM 10RD 736676035199", "736676035199")).toBe(true);
  });
});

describe("titleContainsMpn", () => {
  it("matches MPN as whole token", () => {
    expect(titleContainsMpn("RUGER MAX-9 3523 12+1 NEW", MAX9_12RD.mpn)).toBe(true);
    expect(titleContainsMpn("RUGER MAX-9 3519 10RD", "3519")).toBe(true);
    expect(titleContainsMpn("RUGER MAX-9 13523", "3523")).toBe(false);
  });
});

describe("titleConflictsCapacity", () => {
  it("flags 10rd title when catalog is 12+1", () => {
    expect(titleConflictsCapacity("RUGER MAX-9 10RD USED", 12)).toBe(true);
    expect(titleConflictsCapacity("RUGER MAX-9 12+1 NEW", 12)).toBe(false);
  });
});

describe("filterAskingByIdentity", () => {
  const rows: AskingCompInput[] = [
    {
      price: 189.99,
      title: "RUGER MAX-9 9MM 10RD USED",
      condition: "Used",
      location: "TX",
      itemId: "1",
    },
    {
      price: 399.99,
      title: "RUGER MAX-9 3523 12+1 NEW UPC 736676035236",
      condition: "New",
      location: "AL",
      itemId: "2",
    },
    {
      price: 379.99,
      title: "RUGER MAX-9 3519 10RD NEW",
      condition: "New",
      location: "FL",
      itemId: "3",
    },
  ];

  it("keeps exact UPC new listing for vendor mode", () => {
    const { rows: kept, tier } = filterAskingByIdentity(rows, {
      ...MAX9_12RD,
      newOnlyAsking: true,
      dealerCost: 320,
      minAskRatioOfCost: 0.75,
    });
    expect(tier).toBe("exact-upc");
    expect(kept).toHaveLength(1);
    expect(kept[0]!.price).toBe(399.99);
  });

  it("filters by MPN when UPC absent", () => {
    const { rows: kept, tier } = filterAskingByIdentity(rows, {
      mpn: "3523",
      newOnlyAsking: true,
      catalogDescription: MAX9_12RD.catalogDescription,
    });
    expect(tier).toBe("exact-mpn");
    expect(kept).toHaveLength(1);
    expect(kept[0]!.itemId).toBe("2");
  });
});

describe("filterSoldByIdentity", () => {
  const rows: SoldCompInput[] = [
    { price: 189, salesDate: "2026-01-01", listingType: "Auction", title: "RUGER MAX-9 10RD" },
    { price: 350, salesDate: "2026-02-01", listingType: "Fixed", title: "RUGER MAX-9 736676035236 12+1" },
  ];

  it("prefers UPC-matched sold rows", () => {
    const { rows: kept, tier } = filterSoldByIdentity(rows, MAX9_12RD);
    expect(tier).toBe("exact-upc");
    expect(kept).toHaveLength(1);
    expect(kept[0]!.price).toBe(350);
  });
});
