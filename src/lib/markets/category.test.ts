import { describe, expect, it } from "vitest";

import { inferMarketCategory } from "@/lib/markets/category";

describe("inferMarketCategory", () => {
  it("classifies shotguns from gauge / shotgun cues", () => {
    expect(inferMarketCategory("500", "12 Gauge")).toBe("shotgun");
    expect(inferMarketCategory("Super Black Eagle", "12ga")).toBe("shotgun");
    expect(inferMarketCategory("O/U Field", ".410")).toBe("shotgun");
  });

  it("classifies rifles from model keywords and rifle calibers", () => {
    expect(inferMarketCategory("M&P 15", "5.56 NATO")).toBe("rifle");
    expect(inferMarketCategory("10/22 Carbine", ".22 LR")).toBe("rifle");
    expect(inferMarketCategory("Howa 1500", ".308 Win")).toBe("rifle");
  });

  it("classifies rifle-primary OEMs with bare model names", () => {
    expect(inferMarketCategory("Ridge", "", "Bergara")).toBe("rifle");
    expect(inferMarketCategory("Traverse", "", "Christensen Arms")).toBe("rifle");
    expect(inferMarketCategory("Cascade XT", "", "CVA")).toBe("rifle");
  });

  it("defaults handguns (including revolvers without long-gun cues)", () => {
    expect(inferMarketCategory("Glock 19", "9mm")).toBe("handgun");
    expect(inferMarketCategory("1911", ".45 ACP")).toBe("handgun");
    expect(inferMarketCategory("Python", ".357 Mag")).toBe("handgun");
  });
});
