import { describe, expect, it } from "vitest";

import { flattenDependencies } from "@/lib/gba/catalog-flatten";

describe("flattenDependencies", () => {
  it("flattens NEW/USED trees into unique catalog rows", () => {
    const syncedAt = new Date("2026-07-15T00:00:00Z");
    const rows = flattenDependencies(
      {
        NEW: [
          {
            Manufacturer: "Glock",
            ManufacturerID: 1,
            IsCommonManufacturer: true,
            Models: [
              {
                Model: "19",
                ModelID: 10,
                Calibers: [
                  { Caliber: "9mm", CaliberID: 100 },
                  { Caliber: "9x19", CaliberID: 101 },
                ],
              },
            ],
          },
        ],
        USED: [
          {
            Manufacturer: "Glock",
            ManufacturerID: 1,
            IsCommonManufacturer: true,
            Models: [
              {
                Model: "19",
                ModelID: 10,
                Calibers: [{ Caliber: "9mm", CaliberID: 100 }],
              },
            ],
          },
        ],
      },
      syncedAt,
    );

    expect(rows).toHaveLength(3);
    expect(rows.filter((r) => r.condition === "NEW")).toHaveLength(2);
    expect(rows.filter((r) => r.condition === "USED")).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      manufacturer: "Glock",
      model: "19",
      caliber: "9mm",
      manufacturerId: 1,
      modelId: 10,
      caliberId: 100,
      isCommon: true,
    });
  });
});
