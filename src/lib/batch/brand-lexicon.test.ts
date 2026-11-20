import { describe, expect, it } from "vitest";

import { oaMakersForIdentity, oaModelAliasFor, rewriteBrandLexicon } from "./brand-lexicon";
import { parseTitleBlob } from "./parse";

describe("brand lexicon before model split", () => {
  it("keeps H012X as the model and drops Repeating Arms", () => {
    const parsed = parseTitleBlob("Henry Repeating Arms H012X");
    expect(parsed.manufacturer).toBe("Henry");
    expect(parsed.model.toUpperCase()).toBe("H012X");
    expect(parsed.model).not.toMatch(/repeating|arms/i);
    expect(oaModelAliasFor("Henry", "H012X")?.model).toBe("Big Boy");
  });

  it("reads Izmash / Russia SAIGA-12 without Russia or a slash in the model", () => {
    const parsed = parseTitleBlob("Izmash / Russia SAIGA-12");
    expect(parsed.manufacturer).toBe("Izhmash");
    expect(parsed.model.toUpperCase()).toBe("SAIGA-12");
    expect(parsed.model).not.toMatch(/russia|\//i);
    expect(parsed.category).toBe("shotgun");
    expect(oaMakersForIdentity(parsed.manufacturer, parsed.model).map((m) => m.toUpperCase())).toEqual(
      expect.arrayContaining(["IZHMASH", "SAIGA"]),
    );
  });

  it("maps Izhmash, Kalashnikov, and Saiga onto the Izhmash maker", () => {
    expect(parseTitleBlob("Izhmash Saiga-12").manufacturer).toBe("Izhmash");
    expect(parseTitleBlob("Kalashnikov Saiga-12").manufacturer).toBe("Izhmash");
    expect(parseTitleBlob("Saiga-12").model.toUpperCase()).toContain("SAIGA");
  });

  it("normalizes S&W spellings to Smith & Wesson", () => {
    for (const title of ["S&W Model 66 .357", "S & W Model 66 .357", "Smith and Wesson Model 66 .357"]) {
      const parsed = parseTitleBlob(title);
      expect(parsed.manufacturer).toBe("Smith & Wesson");
      expect(parsed.model.toLowerCase()).not.toMatch(/smith|wesson|^s&w$/);
      expect(parsed.model).toMatch(/66/);
    }
  });

  it("maps Cugir Arms Factory and Romarm/Cugir to Cugir", () => {
    const factory = parseTitleBlob("Cugir Arms Factory WASR-10");
    expect(factory.manufacturer).toBe("Cugir");
    expect(factory.model.toUpperCase()).toContain("WASR");
    expect(factory.model).not.toMatch(/arms|factory/i);

    const romarm = parseTitleBlob("Romarm/Cugir WASR-10");
    expect(romarm.manufacturer).toBe("Cugir");
    expect(romarm.model.toUpperCase()).toContain("WASR");
    expect(romarm.model).not.toMatch(/romarm|\//i);
  });

  it("rewrites the title before model extraction", () => {
    const rewritten = rewriteBrandLexicon("Henry Repeating Arms H012X");
    expect(rewritten.manufacturer).toBe("Henry");
    expect(rewritten.text.toLowerCase()).not.toContain("repeating");
    expect(rewritten.text.toUpperCase()).toContain("H012X");
  });
});
