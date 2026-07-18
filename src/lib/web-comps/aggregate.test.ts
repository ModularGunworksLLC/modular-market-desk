import { describe, expect, it } from "vitest";

import {
  aggregatePrices,
  applyCoolingCapToSold,
  assessAskSoldDivergence,
  buildSearchQuery,
  compareOaToWeb,
  scoreWebConfidence,
  webCanonicalKey,
} from "./aggregate";

describe("webCanonicalKey", () => {
  it("prefers upc when present", () => {
    expect(
      webCanonicalKey({
        manufacturer: "Glock",
        model: "19",
        upc: "764503037253",
      }),
    ).toBe("upc:764503037253");
  });

  it("falls back to identity slug", () => {
    const key = webCanonicalKey({
      manufacturer: "Glock",
      model: "19 Gen5",
      caliber: "9mm",
      category: "handgun",
    });
    expect(key).toContain("glock");
    expect(key).toContain("19 gen5");
  });
});

describe("buildSearchQuery", () => {
  it("includes identity + price", () => {
    expect(buildSearchQuery({ manufacturer: "Glock", model: "19", caliber: "9mm" })).toBe(
      "Glock 19 9mm price",
    );
  });
});

describe("scoreWebConfidence", () => {
  const fresh = new Date();
  const stale = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);

  it("scores high with 3+ domains, fresh, tight spread", () => {
    expect(
      scoreWebConfidence({ domainCount: 3, p25: 500, p75: 700, newestObservedAt: fresh }),
    ).toBe("high");
  });

  it("scores medium with 2 domains fresh", () => {
    expect(
      scoreWebConfidence({ domainCount: 2, p25: 500, p75: 900, newestObservedAt: fresh }),
    ).toBe("medium");
  });

  it("scores low when stale or thin", () => {
    expect(
      scoreWebConfidence({ domainCount: 3, p25: 500, p75: 700, newestObservedAt: stale }),
    ).toBe("low");
    expect(
      scoreWebConfidence({ domainCount: 1, p25: 500, p75: 550, newestObservedAt: fresh }),
    ).toBe("low");
  });
});

describe("aggregatePrices", () => {
  it("summarizes a clean set", () => {
    const agg = aggregatePrices([400, 450, 500, 550, 600]);
    expect(agg.count).toBe(5);
    expect(agg.median).toBe(500);
  });
});

describe("compareOaToWeb", () => {
  it("detects agreement and direction", () => {
    expect(compareOaToWeb(500, 520)).toBe("agrees");
    expect(compareOaToWeb(500, 700)).toBe("web_higher");
    expect(compareOaToWeb(500, 300)).toBe("web_lower");
    expect(compareOaToWeb(null, 500)).toBeNull();
  });
});

describe("assessAskSoldDivergence", () => {
  it("flags cooling when asks sit well under solds", () => {
    expect(
      assessAskSoldDivergence({ soldAnchor: 350, askMedian: 200, askCount: 5 }),
    ).toBe("cooling");
    expect(
      assessAskSoldDivergence({ soldAnchor: 350, askMedian: 340, askCount: 5 }),
    ).toBe("ok");
    expect(
      assessAskSoldDivergence({ soldAnchor: 350, askMedian: 500, askCount: 5 }),
    ).toBe("asks_rich");
    expect(
      assessAskSoldDivergence({ soldAnchor: 350, askMedian: 200, askCount: 1 }),
    ).toBe("thin");
  });
});

describe("applyCoolingCapToSold", () => {
  it("caps decision percentiles to ask median", () => {
    const capped = applyCoolingCapToSold(
      { count: 10, low: 200, p25: 350, median: 400, p75: 450, high: 500, avg: 400 },
      200,
    );
    expect(capped.p25).toBe(200);
    expect(capped.median).toBe(200);
  });
});
