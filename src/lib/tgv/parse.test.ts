import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { parseTgvModelHtml } from "@/lib/tgv/parse";
import { tgvModelPath, tgvSlug } from "@/lib/tgv/resolve-url";

const fixture = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "fixtures/p320-sample.html"),
  "utf8",
);

describe("tgv parse + urls", () => {
  it("builds TGV slugs/paths", () => {
    expect(tgvSlug("Sig Sauer", "P320")).toBe("Sig-Sauer-P320");
    expect(tgvModelPath("Sig Sauer", "P320", "handgun")).toBe(
      "/pistol/Sig-Sauer-P320/price-historical-value",
    );
  });

  it("parses Private Party, 12m averages, and sold sample", () => {
    const p = parseTgvModelHtml(fixture, { path: "/pistol/Sig-Sauer-P320/price-historical-value" });
    expect(p.privatePartyUsed).toBe(391.11);
    expect(p.privatePartyNew).toBe(671.96);
    expect(p.tradeInUsed).toBe(254.22);
    expect(p.avg12mUsed).toBe(385.99);
    expect(p.soldCount).toBe(5175);
    expect(p.usedSoldCount).toBe(3631);
    expect(p.solds.length).toBeGreaterThanOrEqual(1);
    expect(p.solds[0]?.price).toBe(530);
    expect(p.solds[0]?.caliber.toUpperCase()).toContain("9MM");
    expect(p.solds[0]?.upc).toBe("798681639441");
  });
});
