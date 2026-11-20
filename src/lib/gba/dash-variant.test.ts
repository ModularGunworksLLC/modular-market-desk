import { describe, expect, it } from "vitest";

import {
  DASH_BASE_SCORE_CAP,
  resolveBestAttempt,
  resolveSelection,
  type OaDependencies,
} from "./scorer";

function deps(
  manufacturer: string,
  models: { name: string; caliber: string; n?: number }[],
): OaDependencies {
  return {
    USED: [
      {
        Manufacturer: manufacturer,
        ManufacturerID: 1,
        IsCommonManufacturer: true,
        Models: models.map((model, i) => ({
          Model: model.name,
          ModelID: i + 1,
          Calibers: [{ Caliber: model.caliber, CaliberID: i + 1, SoldCount: model.n ?? 10 }],
        })),
      },
    ],
  };
}

describe("dash and slash variant matching", () => {
  it("matches S&W 29-10 exactly when that leaf exists, never Model 10 or Model 29", () => {
    const hit = resolveSelection(
      deps("SMITH & WESSON", [
        { name: "10", caliber: ".38 SPL." },
        { name: "29", caliber: ".44 MAG." },
        { name: "MODEL 29-10", caliber: ".44 MAG.", n: 40 },
      ]),
      { manufacturer: "Smith & Wesson", model: "29-10", caliber: ".44 Magnum", condition: "used" },
    );
    expect(hit?.model).toBe("MODEL 29-10");
    expect(hit?.soldCount).toBe(40);
    expect(hit?.matchNote).toBeUndefined();
    expect(hit?.score).toBeGreaterThan(DASH_BASE_SCORE_CAP);
  });

  it("falls back to base 29 capped at 72 when 29-10 is not in OA, and never Model 10", () => {
    const hit = resolveSelection(
      deps("SMITH & WESSON", [
        { name: "10", caliber: ".38 SPL." },
        { name: "29", caliber: ".44 MAG.", n: 80 },
      ]),
      { manufacturer: "Smith & Wesson", model: "29-10", caliber: ".44", condition: "used" },
    );
    expect(hit?.model).toBe("29");
    expect(hit?.score).toBe(DASH_BASE_SCORE_CAP);
    expect(hit?.matchNote).toBe("Matched base model 29; exact dash variant 29-10 not in OA");
  });

  it("matches S&W 629-1 exactly, and falls back to 629 rather than the suffix", () => {
    const exact = resolveSelection(
      deps("SMITH & WESSON", [
        { name: "629", caliber: ".44 MAG." },
        { name: "629-1", caliber: ".44 MAG.", n: 12 },
        { name: "1", caliber: ".44 MAG." },
      ]),
      { manufacturer: "Smith & Wesson", model: "629-1", caliber: ".44 Magnum", condition: "used" },
    );
    expect(exact?.model).toBe("629-1");

    const fallback = resolveSelection(
      deps("SMITH & WESSON", [
        { name: "629", caliber: ".44 MAG.", n: 20 },
        { name: "1", caliber: ".44 MAG." },
      ]),
      { manufacturer: "Smith & Wesson", model: "629-1", caliber: ".44 Magnum", condition: "used" },
    );
    expect(fallback?.model).toBe("629");
    expect(fallback?.score).toBe(72);
    expect(fallback?.matchNote).toMatch(/base model 629/);
    expect(fallback?.matchNote).toMatch(/629-1/);
  });

  it("matches WASR-10/63 exactly, and falls back to WASR-10 rather than 63", () => {
    const exact = resolveSelection(
      deps("CUGIR", [
        { name: "WASR-10/63", caliber: "7.62x39", n: 15 },
        { name: "WASR-10", caliber: "7.62x39" },
        { name: "63", caliber: "7.62x39" },
      ]),
      { manufacturer: "Cugir", model: "WASR-10/63", caliber: "7.62x39", condition: "used" },
    );
    expect(exact?.model).toBe("WASR-10/63");

    const fallback = resolveSelection(
      deps("CUGIR", [
        { name: "WASR-10", caliber: "7.62x39", n: 22 },
        { name: "63", caliber: "7.62x39" },
      ]),
      { manufacturer: "Cugir", model: "WASR-10/63", caliber: "7.62x39", condition: "used" },
    );
    expect(fallback?.model).toBe("WASR-10");
    expect(fallback?.score).toBe(72);
    expect(fallback?.matchNote).toBe(
      "Matched base model WASR-10; exact dash variant WASR-10/63 not in OA",
    );
  });

  it("still selects Browning 1911-22 with 51 sales over the plain 1911 leaf", () => {
    const hit = resolveBestAttempt(
      deps("BROWNING", [
        { name: "1911", caliber: ".22 LR", n: 11 },
        { name: "1911-22", caliber: ".22 LR", n: 51 },
      ]),
      [{ manufacturer: "Browning", model: "1911-22", caliber: ".22 LR", condition: "used" }],
    );
    expect(hit?.model).toBe("1911-22");
    expect(hit?.soldCount).toBe(51);
    expect(hit?.matchNote).toBeUndefined();
  });
});
