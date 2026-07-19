import { describe, expect, it } from "vitest";

import {
  canonicalizeTgvManufacturer,
  preferModelVariant,
  preferTgvCategory,
  tgvPathCandidates,
  tgvSlug,
} from "./resolve-url";

describe("tgv resolve-url", () => {
  it("canonicalizes brand aliases", () => {
    expect(canonicalizeTgvManufacturer("Smith & Wesson")).toBe("Smith and Wesson");
    expect(canonicalizeTgvManufacturer("Henry Repeating Arms")).toBe("Henry");
    expect(canonicalizeTgvManufacturer("Heritage Manufacturing Inc")).toBe("Heritage");
    expect(canonicalizeTgvManufacturer("SIG SAUER")).toBe("Sig Sauer");
    expect(canonicalizeTgvManufacturer("Winchester Repeating Arms")).toBe("Winchester");
  });

  it("prefers a single OA pipe variant", () => {
    expect(preferModelVariant("1911|1991|Government|Competition")).toBe("Competition");
    expect(preferModelVariant("686|Pigeon|Silver Pigeon 1")).toBe("Silver Pigeon 1");
  });

  it("prefers rifle/shotgun category from cues", () => {
    expect(preferTgvCategory("Bergara", "Ridge", "handgun")).toBe("rifle");
    expect(preferTgvCategory("Winchester", "Super X4", "handgun")).toBe("shotgun");
    expect(preferTgvCategory("Glock", "19", "handgun")).toBe("handgun");
  });

  it("builds rifle candidates before pistol for Bergara Ridge", () => {
    const cands = tgvPathCandidates("Bergara", "Ridge", "handgun");
    expect(cands[0]?.category).toBe("rifle");
    expect(cands[0]?.path).toContain("/rifle/");
    expect(cands.some((c) => c.path.includes("B-14-Ridge"))).toBe(true);
  });

  it("slugs Smith and Wesson like existing ok rows", () => {
    expect(tgvSlug("Smith and Wesson", "Model 1854")).toBe("Smith-And-Wesson-Model-1854");
  });
});
