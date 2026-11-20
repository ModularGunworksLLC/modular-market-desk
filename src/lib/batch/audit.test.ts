import { describe, expect, it } from "vitest";

import { auditRowsFromBatch } from "./audit";

describe("batch audit rows", () => {
  it("keeps lot, title, and the raw current bid, including a blank bid", () => {
    const rows = auditRowsFromBatch([
      {
        rowNumber: 2,
        lot: "20A",
        lotTitle: "Rock River LAR-15 5.56",
        manufacturer: "Rock River Arms",
        model: "LAR 15",
        currentBid: 350,
      },
      {
        rowNumber: 3,
        lot: "23",
        lotTitle: "",
        manufacturer: "Windham",
        model: "WW-15",
        currentBid: null,
      },
    ]);
    expect(rows[0]).toEqual({
      rowNumber: 2,
      lot: "20A",
      title: "Rock River LAR-15 5.56",
      currentBid: 350,
      accessories: [],
      flags: [],
    });
    expect(rows[1]?.title).toBe("Windham WW-15");
    expect(rows[1]?.currentBid).toBeNull();
    expect(rows[0]?.accessories).toEqual([]);
  });

  it("keeps w/ accessories and parts flags with the saved row", () => {
    const rows = auditRowsFromBatch([
      {
        rowNumber: 1,
        lot: "4",
        lotTitle: "Remington 700 w/ scope, sporter",
        currentBid: 400,
        accessories: ["scope"],
        flags: ["sporter"],
      },
    ]);
    expect(rows[0]?.accessories).toEqual(["scope"]);
    expect(rows[0]?.flags).toEqual(["sporter"]);
  });
});
