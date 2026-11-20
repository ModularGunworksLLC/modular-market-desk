import { describe, expect, it } from "vitest";

import {
  buildCaliberTokens,
  buildModelAliases,
  cleanModelForOa,
  editDistance,
  extractFamilyTokens,
  familyTokensCompatible,
  hasUnmatchedPremiumVariant,
  inferCaliberFromText,
  isNearMiss,
  isModelNearMiss,
  maxTypoDistance,
  modelQueryVariants,
  modelSearchTokens,
  norm,
  oaConditions,
  primaryModelNumber,
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

  it("cleans auction noise from model for OA match", () => {
    expect(cleanModelForOa("Super Blackhawk in Gun Locker Hard Case")).toBe("Super Blackhawk");
    expect(cleanModelForOa("DR920 Elite with Holosun HS507C X2, (3) Magazines & Bag")).toBe(
      "DR920 Elite",
    );
    expect(cleanModelForOa("Firearms G3C")).toBe("G3C");
    expect(cleanModelForOa("G3C 9x19mm")).toBe("G3C");
    expect(modelQueryVariants("P365-9 BXR3")).toContain("P365");
  });

  it("matches Ruger Super Blackhawk after case trailer stripped", () => {
    const rugerDeps: OaDependencies = {
      USED: [
        {
          Manufacturer: "RUGER",
          ManufacturerID: 99,
          IsCommonManufacturer: true,
          Models: [
            {
              Model: "NEW MODEL SUPER BLACKHAWK",
              ModelID: 501,
              Calibers: [{ Caliber: ".44 MAGNUM", CaliberID: 44 }],
            },
          ],
        },
      ],
    };
    let sel = null;
    for (const q of resolveQueryAttempts({
      manufacturer: "Ruger",
      model: "Super Blackhawk in Gun Locker Hard Case",
      caliber: ".44 Magnum",
      condition: "used",
    })) {
      sel = resolveSelection(rugerDeps, q);
      if (sel) break;
    }
    expect(sel).not.toBeNull();
    expect(sel!.model.toLowerCase()).toContain("blackhawk");
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

describe("typo-tolerant resolve", () => {
  const rugerDeps: OaDependencies = {
    USED: [
      {
        Manufacturer: "Ruger",
        ManufacturerID: 50,
        IsCommonManufacturer: true,
        Models: [
          {
            Model: "SP101",
            ModelID: 5101,
            Calibers: [{ Caliber: ".357 MAG", CaliberID: 357 }],
          },
        ],
      },
      {
        Manufacturer: "Rugers Arms Co",
        ManufacturerID: 51,
        Models: [
          {
            Model: "Other",
            ModelID: 5199,
            Calibers: [{ Caliber: ".22 LR", CaliberID: 22 }],
          },
        ],
      },
    ],
  };

  it("resolves Rugr + SP101 typo to Ruger SP101", () => {
    const sel = resolveSelection(rugerDeps, {
      manufacturer: "Rugr",
      model: "SP101",
      caliber: ".357 MAG",
      condition: "used",
    });
    expect(sel).not.toBeNull();
    expect(sel!.manufacturer).toBe("Ruger");
    expect(sel!.modelId).toBe(5101);
    expect(sel!.caliberId).toBe(357);
  });

  it("resolves SP 101 spaced model via norm / variants", () => {
    let sel = null;
    for (const q of resolveQueryAttempts({
      manufacturer: "Ruger",
      model: "SP 101",
      caliber: ".357",
      condition: "used",
    })) {
      sel = resolveSelection(rugerDeps, q);
      if (sel) break;
    }
    expect(sel).not.toBeNull();
    expect(sel!.modelId).toBe(5101);
  });

  it("does not invent a brand from tiny stub Si", () => {
    const sigDeps: OaDependencies = {
      USED: [
        {
          Manufacturer: "Sig Sauer",
          ManufacturerID: 80,
          Models: [
            {
              Model: "P365",
              ModelID: 8001,
              Calibers: [{ Caliber: "9mm", CaliberID: 9 }],
            },
          ],
        },
        {
          Manufacturer: "Smith & Wesson",
          ManufacturerID: 81,
          Models: [
            {
              Model: "SD9 VE",
              ModelID: 8101,
              Calibers: [{ Caliber: "9mm", CaliberID: 9 }],
            },
          ],
        },
      ],
    };
    const sel = resolveSelection(sigDeps, {
      manufacturer: "Si",
      model: "P365",
      caliber: "9mm",
      condition: "used",
    });
    expect(sel).toBeNull();
  });

  it("refuses ambiguous manufacturer typos when two brands both fit", () => {
    const ambiguousDeps: OaDependencies = {
      USED: [
        {
          Manufacturer: "Boya",
          ManufacturerID: 1,
          Models: [
            {
              Model: "Widget",
              ModelID: 11,
              Calibers: [{ Caliber: "9mm", CaliberID: 9 }],
            },
          ],
        },
        {
          Manufacturer: "Boyb",
          ManufacturerID: 2,
          Models: [
            {
              Model: "Widget",
              ModelID: 22,
              Calibers: [{ Caliber: "9mm", CaliberID: 9 }],
            },
          ],
        },
      ],
    };
    // "Boyc" is edit-distance 1 from both Boya and Boyb
    const sel = resolveSelection(ambiguousDeps, {
      manufacturer: "Boyc",
      model: "Widget",
      caliber: "9mm",
      condition: "used",
    });
    expect(sel).toBeNull();
  });

  it("editDistance and isNearMiss helpers", () => {
    expect(editDistance("ruger", "rugr")).toBe(1);
    expect(isNearMiss("rugr", "ruger")).toBe(true);
    expect(isNearMiss("si", "sig")).toBe(false);
    expect(maxTypoDistance(2)).toBe(0);
    expect(maxTypoDistance(4)).toBe(1);
    expect(maxTypoDistance(8)).toBe(2);
  });

  it("does not treat P320 as a typo of P220", () => {
    expect(isModelNearMiss("p320", "p220")).toBe(false);
    expect(isModelNearMiss("csx", "cs9")).toBe(false);
    expect(isModelNearMiss("pps", "ppq")).toBe(false);
    expect(isModelNearMiss("sp10l", "sp101")).toBe(true);
    expect(extractFamilyTokens("P320 Compact")).toEqual(expect.arrayContaining(["p320"]));
    expect(familyTokensCompatible("P320", "P220")).toBe(false);
    expect(familyTokensCompatible("P320", "P320 XFIVE")).toBe(true);
    expect(hasUnmatchedPremiumVariant("P320", "P320 XFIVE")).toBe(true);
    expect(hasUnmatchedPremiumVariant("P320 XFIVE", "P320 XFIVE")).toBe(false);
    expect(inferCaliberFromText("P320 9mm")).toBe("9mm");
  });

  const sigTree: OaDependencies = {
    USED: [
      {
        Manufacturer: "SIG SAUER",
        ManufacturerID: 1,
        IsCommonManufacturer: true,
        Models: [
          {
            Model: "P220",
            ModelID: 220,
            Calibers: [{ Caliber: ".45 ACP", CaliberID: 45 }],
          },
          {
            Model: "P320",
            ModelID: 320,
            Calibers: [{ Caliber: "9mm Luger", CaliberID: 9 }],
          },
          {
            Model: "P320 XFIVE",
            ModelID: 325,
            Calibers: [{ Caliber: "9mm Luger", CaliberID: 9 }],
          },
          {
            Model: "P320 LEGION",
            ModelID: 326,
            Calibers: [{ Caliber: "9mm Luger", CaliberID: 9 }],
          },
          {
            Model: "P365",
            ModelID: 365,
            Calibers: [{ Caliber: "9mm Luger", CaliberID: 9 }],
          },
        ],
      },
    ],
  };

  it("does not resolve P320 9mm onto a P220 .45 leaf", () => {
    const sel = resolveSelection(sigTree, {
      manufacturer: "Sig Sauer",
      model: "P320",
      caliber: "9mm",
      condition: "used",
    });
    expect(sel?.model).toBe("P320");
    expect(sel?.caliber.toLowerCase()).toContain("9");
  });

  it("does not price a duty P320 off XFIVE / Legion leaves", () => {
    const sel = resolveSelection(sigTree, {
      manufacturer: "Sig Sauer",
      model: "P320",
      caliber: "9mm",
      condition: "used",
    });
    expect(sel?.modelId).toBe(320);
    expect(sel?.model).toBe("P320");
  });

  it("still resolves an explicit P320 XFIVE query onto XFIVE", () => {
    const sel = resolveSelection(sigTree, {
      manufacturer: "Sig Sauer",
      model: "P320 XFIVE",
      caliber: "9mm",
      condition: "used",
    });
    expect(sel?.model).toBe("P320 XFIVE");
  });

  it("does not fall onto P220 when the catalog has no P320", () => {
    const sigDeps: OaDependencies = {
      USED: [
        {
          Manufacturer: "SIG SAUER",
          ManufacturerID: 1,
          Models: [
            {
              Model: "P220",
              ModelID: 220,
              Calibers: [{ Caliber: "9mm Luger", CaliberID: 9 }],
            },
          ],
        },
      ],
    };
    const sel = resolveSelection(sigDeps, {
      manufacturer: "Sig Sauer",
      model: "P320",
      caliber: "9mm",
      condition: "used",
    });
    expect(sel).toBeNull();
  });

  it("does not fall onto XFIVE when that is the only P320 9mm leaf", () => {
    const xfiveOnly: OaDependencies = {
      USED: [
        {
          Manufacturer: "SIG SAUER",
          ManufacturerID: 1,
          Models: [
            {
              Model: "P220",
              ModelID: 220,
              Calibers: [{ Caliber: ".45 ACP", CaliberID: 45 }],
            },
            {
              Model: "P320 XFIVE",
              ModelID: 325,
              Calibers: [{ Caliber: "9mm Luger", CaliberID: 9 }],
            },
          ],
        },
      ],
    };
    const sel = resolveSelection(xfiveOnly, {
      manufacturer: "Sig Sauer",
      model: "P320",
      caliber: "9mm",
      condition: "used",
    });
    expect(sel).toBeNull();
  });

  it("does not resolve P250 or P290 onto a P210 leaf", () => {
    const sigDeps: OaDependencies = {
      USED: [
        {
          Manufacturer: "SIG SAUER",
          ManufacturerID: 1,
          Models: [
            {
              Model: "P210",
              ModelID: 210,
              Calibers: [{ Caliber: "9mm Luger", CaliberID: 9 }],
            },
          ],
        },
      ],
    };
    expect(
      resolveSelection(sigDeps, {
        manufacturer: "Sig Sauer",
        model: "P250",
        caliber: "9mm",
        condition: "used",
      }),
    ).toBeNull();
    expect(
      resolveSelection(sigDeps, {
        manufacturer: "Sig Sauer",
        model: "P290",
        caliber: "9mm",
        condition: "used",
      }),
    ).toBeNull();
  });

  it("does not resolve S&W 29-10 onto Model 10", () => {
    expect(primaryModelNumber("29-10")).toBe("29");
    const swDeps: OaDependencies = {
      USED: [
        {
          Manufacturer: "SMITH & WESSON",
          ManufacturerID: 10106,
          IsCommonManufacturer: true,
          Models: [
            {
              Model: "10",
              ModelID: 10,
              Calibers: [{ Caliber: ".38 SPL.", CaliberID: 38 }],
            },
            {
              Model: "29",
              ModelID: 29,
              Calibers: [{ Caliber: ".44 MAG.", CaliberID: 44 }],
            },
          ],
        },
      ],
    };
    const sel = resolveSelection(swDeps, {
      manufacturer: "Smith & Wesson",
      model: "29-10",
      caliber: ".44",
      condition: "used",
    });
    expect(sel?.model).toBe("29");
  });

  it("does not treat Commando as a typo of Commander", () => {
    expect(isModelNearMiss("commando", "commander")).toBe(false);
  });

  it("keeps 700 7mm Rem Mag off the .22-250 leaf", () => {
    const remDeps: OaDependencies = {
      USED: [
        {
          Manufacturer: "Remington",
          ManufacturerID: 7,
          IsCommonManufacturer: true,
          Models: [
            {
              Model: "700",
              ModelID: 700,
              Calibers: [
                { Caliber: ".22-250 Rem", CaliberID: 1 },
                { Caliber: "7mm Rem Mag", CaliberID: 2 },
              ],
            },
          ],
        },
      ],
    };
    const hit = resolveSelection(remDeps, {
      manufacturer: "Remington",
      model: "700",
      caliber: "7mm Rem Mag",
      condition: "used",
    });
    expect(hit?.caliber).toMatch(/7mm/i);
    expect(
      resolveSelection(remDeps, {
        manufacturer: "Remington",
        model: "700",
        condition: "used",
      }),
    ).toBeNull();
  });

  it("does not land on sibling letter-codes, sizes, or calibers", () => {
    const cases: Array<{
      query: { manufacturer: string; model: string; caliber: string };
      catalog: { model: string; caliber: string };
      expectModel?: string;
      expectNull?: boolean;
    }> = [
      {
        query: { manufacturer: "Walther", model: "CCP M2", caliber: ".380 ACP" },
        catalog: { model: "PPQ M2", caliber: ".22 LR" },
        expectNull: true,
      },
      {
        query: { manufacturer: "Walther", model: "PPS", caliber: "9mm" },
        catalog: { model: "PPQ", caliber: "9mm" },
        expectNull: true,
      },
      {
        query: { manufacturer: "Smith & Wesson", model: "CSX", caliber: "9mm" },
        catalog: { model: "CS9", caliber: "9mm" },
        expectNull: true,
      },
      {
        query: { manufacturer: "Ruger", model: "P90", caliber: ".45 ACP" },
        catalog: { model: "P97", caliber: ".45 ACP" },
        expectNull: true,
      },
      {
        query: { manufacturer: "Sig Sauer", model: "P220 Elite", caliber: ".45 ACP" },
        catalog: { model: "P227", caliber: ".45 ACP" },
        expectNull: true,
      },
      {
        query: { manufacturer: "Colt", model: "Commando", caliber: ".38 Special" },
        catalog: { model: "Commander", caliber: ".38 Super" },
        expectNull: true,
      },
      {
        query: { manufacturer: "Taurus", model: "G4X", caliber: "9mm" },
        catalog: { model: "TaurusTX", caliber: "9mm" },
        expectNull: true,
      },
      {
        query: { manufacturer: "Smith & Wesson", model: "SD40VE", caliber: ".40 S&W" },
        catalog: { model: "40", caliber: ".38 SPL." },
        expectNull: true,
      },
      {
        query: { manufacturer: "Beretta", model: "92 Compact", caliber: "9mm" },
        catalog: { model: "92", caliber: "9mm Luger" },
        expectNull: true,
      },
      {
        query: { manufacturer: "CZ", model: "82", caliber: "9x18" },
        catalog: { model: "82", caliber: "9mm Luger" },
        expectNull: true,
      },
      {
        query: { manufacturer: "Marlin", model: "336", caliber: ".35 Rem" },
        catalog: { model: "336", caliber: ".30-30 Win" },
        expectNull: true,
      },
    ];

    for (const row of cases) {
      const deps: OaDependencies = {
        USED: [
          {
            Manufacturer: row.query.manufacturer,
            ManufacturerID: 1,
            IsCommonManufacturer: true,
            Models: [
              {
                Model: row.catalog.model,
                ModelID: 99,
                Calibers: [{ Caliber: row.catalog.caliber, CaliberID: 1 }],
              },
            ],
          },
        ],
      };
      const sel = resolveSelection(deps, { ...row.query, condition: "used" });
      if (row.expectNull) {
        expect(sel, `${row.query.model} must not resolve to ${row.catalog.model}`).toBeNull();
      }
    }
  });

  it("still resolves 92 Compact onto a Compact leaf", () => {
    const deps: OaDependencies = {
      USED: [
        {
          Manufacturer: "Beretta",
          ManufacturerID: 1,
          IsCommonManufacturer: true,
          Models: [
            {
              Model: "92",
              ModelID: 92,
              Calibers: [{ Caliber: "9mm Luger", CaliberID: 9 }],
            },
            {
              Model: "92 Compact",
              ModelID: 920,
              Calibers: [{ Caliber: "9mm Luger", CaliberID: 9 }],
            },
          ],
        },
      ],
    };
    const sel = resolveSelection(deps, {
      manufacturer: "Beretta",
      model: "92 Compact",
      caliber: "9mm",
      condition: "used",
    });
    expect(sel?.model).toBe("92 Compact");
  });
});
