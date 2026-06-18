import { describe, expect, it } from "vitest";

import {
  buildCaliberTokens,
  buildModelAliases,
  modelSearchTokens,
  norm,
  oaConditions,
  resolveQueryAttempts,
  resolveSelection,
  type OaDependencies,
} from "./scorer";

describe("norm", () => {
  it("strips non-alphanumerics and lowercases", () => {
    expect(norm("Smith & Wesson")).toBe("smithwesson");
    expect(norm(" 9mm Luger ")).toBe("9mmluger");
    expect(norm(null)).toBe("");
  });
});

describe("buildCaliberTokens", () => {
  it("expands the 9mm family", () => {
    const forms = buildCaliberTokens("9mm");
    expect(forms).toContain("9x19");
    expect(forms).toContain("9mm luger");
    expect(forms).toContain("9mm parabellum");
  });

  it("treats 9x19 as the same group as 9mm", () => {
    const forms = buildCaliberTokens("9x19");
    expect(forms).toContain("9mm");
    expect(forms).toContain("9mm luger");
  });

  it("aliases 5.56 and .223", () => {
    const forms = buildCaliberTokens(".223 Rem");
    const compact = forms.map((f) => f.replace(/[^a-z0-9]/g, ""));
    expect(compact).toContain("556");
    expect(compact).toContain("223rem");
  });

  it("returns empty for blank caliber", () => {
    expect(buildCaliberTokens("")).toEqual([]);
  });
});

describe("buildModelAliases", () => {
  it("expands glock model numbers", () => {
    const aliases = buildModelAliases({ manufacturer: "Glock", model: "19", variant: "Gen 5" });
    expect(aliases).toContain("g19");
    expect(aliases).toContain("gen5");
  });
});

describe("modelSearchTokens", () => {
  it("includes glock prefix tokens for numeric models", () => {
    const tokens = modelSearchTokens({ manufacturer: "Glock", model: "19" });
    expect(tokens).toContain("19");
    expect(tokens).toContain("g19");
  });
});

describe("oaConditions", () => {
  it("maps desk condition to dependency buckets", () => {
    expect(oaConditions({ manufacturer: "x", model: "y", condition: "new" })).toEqual(["NEW"]);
    expect(oaConditions({ manufacturer: "x", model: "y", condition: "used" })).toEqual(["USED"]);
    expect(oaConditions({ manufacturer: "x", model: "y" })).toEqual(["NEW", "USED"]);
  });
});

describe("resolveSelection", () => {
  const deps: OaDependencies = {
    NEW: [
      {
        Manufacturer: "Glock Inc.",
        ManufacturerID: 100,
        IsCommonManufacturer: true,
        Models: [
          {
            Model: "G19 Gen 5",
            ModelID: 5001,
            Calibers: [
              { Caliber: "9mm Luger", CaliberID: 9001 },
              { Caliber: ".40 S&W", CaliberID: 9002 },
            ],
          },
          {
            Model: "G17 Gen 5",
            ModelID: 5002,
            Calibers: [{ Caliber: "9x19", CaliberID: 9001 }],
          },
        ],
      },
      {
        Manufacturer: "Smith & Wesson",
        ManufacturerID: 200,
        Models: [{ Model: "M&P Shield", ModelID: 6001, Calibers: [{ Caliber: "9mm", CaliberID: 9001 }] }],
      },
    ],
  };

  it("resolves a Glock 19 9mm to the right model + caliber", () => {
    const sel = resolveSelection(deps, {
      manufacturer: "Glock",
      model: "19",
      variant: "Gen 5",
      caliber: "9mm",
      condition: "new",
    });
    expect(sel).not.toBeNull();
    expect(sel!.modelId).toBe(5001);
    expect(sel!.caliberId).toBe(9001);
    expect(sel!.conditionParam).toBe("New");
    expect(sel!.score).toBeGreaterThan(80);
  });

  it("matches 9x19 caliber input against a 9mm catalog entry", () => {
    const sel = resolveSelection(deps, {
      manufacturer: "Glock",
      model: "19",
      caliber: "9x19",
      condition: "new",
    });
    expect(sel).not.toBeNull();
    expect(sel!.caliberId).toBe(9001);
  });

  it("resolves Savage 1911 via Savage Arms fallback", () => {
    const savageDeps: OaDependencies = {
      NEW: [
        {
          Manufacturer: "Savage Arms",
          ManufacturerID: 50,
          Models: [
            {
              Model: "SAVAGE 1911 GOV'T STYLE",
              ModelID: 9001,
              Calibers: [{ Caliber: ".45 ACP", CaliberID: 45 }],
            },
          ],
        },
      ],
    };
    const attempts = resolveQueryAttempts({
      manufacturer: "Savage",
      model: "1911",
      caliber: "45 ACP",
      condition: "new",
    });
    let sel = null;
    for (const q of attempts) {
      sel = resolveSelection(savageDeps, q);
      if (sel) break;
    }
    expect(sel).not.toBeNull();
    expect(sel!.model).toContain("1911");
    expect(sel!.caliberId).toBe(45);
  });

  it("compacts M&P 45 to M&P45 for OA catalog match", () => {
    const swDeps: OaDependencies = {
      USED: [
        {
          Manufacturer: "SMITH & WESSON",
          ManufacturerID: 10106,
          Models: [
            {
              Model: "M&P45",
              ModelID: 56165,
              Calibers: [{ Caliber: ".45 ACP", CaliberID: 8125 }],
            },
          ],
        },
      ],
    };
    let sel = null;
    for (const q of resolveQueryAttempts({
      manufacturer: "Smith & Wesson",
      model: "M&P 45",
      caliber: ".45 ACP",
      condition: "used",
    })) {
      sel = resolveSelection(swDeps, q);
      if (sel) break;
    }
    expect(sel).not.toBeNull();
    expect(sel!.model).toBe("M&P45");
  });

  it("resolves compact SD9VE against spaced OA catalog model S&W SD9 VE", () => {
    const swDeps: OaDependencies = {
      USED: [
        {
          Manufacturer: "SMITH & WESSON",
          ManufacturerID: 10106,
          IsCommonManufacturer: true,
          Models: [
            {
              Model: "S&W SD9 VE",
              ModelID: 126556,
              Calibers: [{ Caliber: "9MM LUGER", CaliberID: 8206 }],
            },
          ],
        },
      ],
    };
    let sel = null;
    for (const q of resolveQueryAttempts({
      manufacturer: "Smith & Wesson",
      model: "SD9VE",
      caliber: "9mm",
      condition: "new",
    })) {
      sel = resolveSelection(swDeps, q);
      if (sel) break;
    }
    expect(sel).not.toBeNull();
    expect(sel!.model).toContain("SD9");
  });

  it("returns null when manufacturer is absent from the catalog", () => {
    const sel = resolveSelection(deps, { manufacturer: "Beretta", model: "92", caliber: "9mm" });
    expect(sel).toBeNull();
  });

  it("ignores buckets not searched for the condition", () => {
    const sel = resolveSelection(deps, {
      manufacturer: "Glock",
      model: "19",
      caliber: "9mm",
      condition: "used",
    });
    expect(sel).toBeNull();
  });
});
