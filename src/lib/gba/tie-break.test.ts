import { describe, expect, it } from "vitest";

import {
  buildCaliberTokens,
  MIN_MATCH_CONFIDENCE,
  preferCatalogLeaf,
  resolveBestAttempt,
  resolveSelection,
  type OaDependencies,
  type OaSelection,
} from "./scorer";

function leaf(over: Partial<OaSelection> & Pick<OaSelection, "model" | "score" | "soldCount">): OaSelection {
  return {
    conditionKey: "USED",
    conditionParam: "Used",
    manufacturerId: 1,
    manufacturer: "BROWNING",
    modelId: 1,
    caliberId: 1,
    caliber: ".22 LR",
    ...over,
  };
}

describe("sample-size tie break", () => {
  it("prefers the larger sold sample when scores are within 5 and both clear 70", () => {
    const plain = leaf({ model: "1911", modelId: 1, score: 92, soldCount: 11 });
    const specific = leaf({ model: "1911-22", modelId: 2, score: 88, soldCount: 51 });
    const query = { manufacturer: "Browning", model: "1911-22", caliber: ".22 LR", condition: "used" as const };
    expect(plain.score).toBeGreaterThanOrEqual(MIN_MATCH_CONFIDENCE);
    expect(specific.score).toBeGreaterThanOrEqual(MIN_MATCH_CONFIDENCE);
    expect(Math.abs(plain.score - specific.score)).toBeLessThanOrEqual(5);
    expect(preferCatalogLeaf(specific, plain, query)).toBe(true);
    expect(preferCatalogLeaf(plain, specific, query)).toBe(false);
  });

  it("picks BROWNING 1911-22 .22 LR (51 sold) over BROWNING 1911 .22 LR (11 sold)", () => {
    const deps: OaDependencies = {
      USED: [
        {
          Manufacturer: "BROWNING",
          ManufacturerID: 10,
          IsCommonManufacturer: true,
          Models: [
            {
              Model: "1911",
              ModelID: 11,
              Calibers: [{ Caliber: ".22 LR", CaliberID: 22, SoldCount: 11 }],
            },
            {
              Model: "1911-22",
              ModelID: 51,
              Calibers: [{ Caliber: ".22 LR", CaliberID: 22, SoldCount: 51 }],
            },
          ],
        },
      ],
    };
    const query = {
      manufacturer: "Browning",
      model: "1911-22",
      caliber: ".22 LR",
      condition: "used" as const,
    };
    const hit = resolveBestAttempt(deps, [query]) ?? resolveSelection(deps, query);
    expect(hit?.model).toBe("1911-22");
    expect(hit?.soldCount).toBe(51);
    expect(hit?.caliber).toMatch(/22/);
  });
});

describe("bare caliber aliases", () => {
  it("does not treat 22, 45, 40, or 357 as interchangeable stubs", () => {
    expect(buildCaliberTokens(".22 LR")).not.toContain("22");
    expect(buildCaliberTokens(".22 WMR")).not.toContain("22");
    expect(buildCaliberTokens(".45 ACP")).not.toContain("45");
    expect(buildCaliberTokens(".45-70")).not.toContain("45");
    expect(buildCaliberTokens(".40 S&W")).not.toContain("40");
    expect(buildCaliberTokens(".357 Mag")).not.toContain("357");
    expect(buildCaliberTokens(".357 SIG")).not.toContain("357");
  });
});
