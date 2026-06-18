import { describe, expect, it } from "vitest";

import {
  filterOutlierPrices,
  filterSoldCompRows,
  isIncompleteAskingListing,
  isNonFirearmCompTitle,
  selectSoldRowsForDisplay,
} from "./comp-filter";
import { summarize } from "./arbitrage/stats";
import type { SoldCompRow } from "./gba/client";

describe("filterOutlierPrices", () => {
  it("removes extreme high sales from a standard distribution", () => {
    const prices = [200, 210, 220, 230, 240, 250, 260, 270, 280, 4000, 2650];
    const { filtered, removed } = filterOutlierPrices(prices);
    expect(removed).toBeGreaterThan(0);
    expect(filtered.every((p) => p < 1000)).toBe(true);
  });
});

describe("selectSoldRowsForDisplay", () => {
  it("prefers mid-band recent rows over top outliers", () => {
    const rows: SoldCompRow[] = [
      { price: 4000, salesDate: "2026-01-01", listingType: "Auction" },
      { price: 250, salesDate: "2026-02-01", listingType: "Fixed" },
      { price: 280, salesDate: "2026-03-01", listingType: "Fixed" },
      { price: 265, salesDate: "2026-04-01", listingType: "Fixed" },
    ];
    const stats = summarize([250, 280, 265, 200, 240]);
    const display = selectSoldRowsForDisplay(rows, stats);
    expect(display.some((r) => r.price >= 4000)).toBe(false);
    expect(display[0]?.salesDate).toBe("2026-04-01");
  });
});

describe("isNonFirearmCompTitle", () => {
  it("flags magazines and receivers", () => {
    expect(isNonFirearmCompTitle("WALTHER MAG PDP COMPACT 9MM 10RD")).toBe(true);
    expect(isNonFirearmCompTitle("RUGER 10/22 RECEIVER NEW FACTORY STRIPPED")).toBe(true);
  });

  it("allows complete pistol titles", () => {
    expect(isNonFirearmCompTitle("WALTHER PDP F-SERIES PRO-E 9MM 3.5 18RD")).toBe(false);
  });
});

describe("filterSoldCompRows", () => {
  it("drops cheap mag sales for handgun comps", () => {
    const rows = [
      { price: 33, salesDate: "2026-01-01", listingType: "Fixed", title: "PDP Magazine 9mm" },
      { price: 699, salesDate: "2026-02-01", listingType: "Fixed", title: "WALTHER PDP PRO E 9MM" },
    ];
    const { rows: kept, removed } = filterSoldCompRows(rows, "handgun");
    expect(removed).toBe(1);
    expect(kept).toHaveLength(1);
    expect(kept[0]!.price).toBe(699);
  });
});

describe("isIncompleteAskingListing", () => {
  it("flags stripped receivers", () => {
    expect(
      isIncompleteAskingListing({
        price: 68.99,
        title: "RUGER 10/22 RECEIVER NEW FACTORY STRIPPED",
        condition: "",
        location: "",
        itemId: null,
      }),
    ).toBe(true);
  });

  it("allows complete rifle titles", () => {
    expect(
      isIncompleteAskingListing({
        price: 218.9,
        title: "RUG 10-22 22LR 18.5 BLK 10RD",
        condition: "",
        location: "",
        itemId: null,
      }),
    ).toBe(false);
  });
});
