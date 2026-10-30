import { describe, expect, it } from "vitest";

import { describeOaMarket, liveOaUnavailableBanner, weeklySyncFailureNote } from "@/lib/oa/live-label";

const CACHE = "local cache: Glock 19 9mm (USED) — 12 sold, 4 asking";

describe("OA live labeling", () => {
  it("uses the required sentence when the token is unauthorized and cache comps exist", () => {
    const described = describeOaMarket({
      block: null,
      liveHttpStatus: 401,
      used: "cache",
      hasComps: true,
      cacheSource: CACHE,
      liveSource: "live OA (12 sold, 4 asking)",
    });
    expect(described.availability).toEqual({
      dataSource: "cache",
      liveUnavailable: true,
      reason: "unauthorized",
      banner: liveOaUnavailableBanner("unauthorized", "cache", true),
    });
    expect(described.availability.banner).toBe(
      "Live OA data unavailable: token unauthorized. Results below use the local catalog cache and may be stale.",
    );
    expect(described.sourceLabel.toLowerCase()).toContain("local cache");
    expect(described.sourceLabel.toLowerCase()).toContain("not live");
    expect(described.sourceLabel).not.toMatch(/^live OA/);
  });

  it("labels an expired token the same way and does not call cache numbers live", () => {
    const described = describeOaMarket({
      block: "expired",
      liveHttpStatus: null,
      used: "cache",
      hasComps: true,
      cacheSource: CACHE,
      liveSource: null,
    });
    expect(described.availability.banner).toBe(
      "Live OA data unavailable: token expired. Results below use the local catalog cache and may be stale.",
    );
    expect(described.availability.dataSource).toBe("cache");
    expect(described.availability.liveUnavailable).toBe(true);
  });

  it("says there is no cache when the token is missing and nothing was stored", () => {
    const described = describeOaMarket({
      block: "missing",
      liveHttpStatus: null,
      used: "none",
      hasComps: false,
      cacheSource: null,
      liveSource: null,
    });
    expect(described.availability.banner).toBe(
      "Live OA data unavailable: token missing. No local catalog cache is available for this item.",
    );
    expect(described.availability.dataSource).toBe("none");
  });

  it("keeps a healthy cache labeled as cache with no alarm", () => {
    const described = describeOaMarket({
      block: null,
      liveHttpStatus: null,
      used: "cache",
      hasComps: true,
      cacheSource: CACHE,
      liveSource: null,
    });
    expect(described.availability.liveUnavailable).toBe(false);
    expect(described.availability.banner).toBeNull();
    expect(described.availability.dataSource).toBe("cache");
    expect(described.sourceLabel).toContain("not live");
  });

  it("keeps a successful live pull labeled live", () => {
    const described = describeOaMarket({
      block: null,
      liveHttpStatus: null,
      used: "live",
      hasComps: true,
      cacheSource: CACHE,
      liveSource: "live OA (8 sold, 2 asking)",
    });
    expect(described.availability.dataSource).toBe("live");
    expect(described.availability.banner).toBeNull();
    expect(described.sourceLabel).toBe("live OA (8 sold, 2 asking)");
  });

  it("writes a loud weekly-sync note for a blocked token", () => {
    const note = weeklySyncFailureNote("expired");
    expect(note).toContain("Weekly market sync failed");
    expect(note).toContain("token expired");
    expect(note.toLowerCase()).not.toContain("eyj");
  });
});
