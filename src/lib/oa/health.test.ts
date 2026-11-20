import { describe, expect, it } from "vitest";

import {
  formatOaHealthBanner,
  formatOaMatchLabel,
  isOaCompStale,
  oaCompAgeDays,
} from "./health";

describe("OA health labels", () => {
  const now = new Date("2026-11-19T12:00:00Z");

  it("marks comps older than 14 days stale", () => {
    const synced = new Date("2026-09-11T23:17:00Z");
    const age = oaCompAgeDays(synced, now);
    expect(age).toBeGreaterThan(14);
    expect(isOaCompStale(age, 14)).toBe(true);
    expect(isOaCompStale(10, 14)).toBe(false);
  });

  it("shows the full leaf, n, and score without truncating", () => {
    const label = formatOaMatchLabel({
      manufacturer: "BROWNING",
      model: "1911-22",
      caliber: ".22 LR",
      condition: "USED",
      soldCount: 51,
      score: 92.4,
      ageDays: 69,
      stale: true,
    });
    expect(label).toContain("BROWNING 1911-22 .22 LR (USED)");
    expect(label).toContain("n=51");
    expect(label).toContain("score 92");
    expect(label).toContain("STALE");
    expect(label.length).toBeGreaterThan(40);
  });

  it("banners an Unauthorized token without claiming it was fixed", () => {
    const banner = formatOaHealthBanner({
      hasToken: true,
      lastError: "Unauthorized - re-paste the Outdoor Analytics token",
      lastSyncedAt: new Date("2026-09-11T23:17:00Z"),
      now,
    });
    expect(banner.tone).toBe("bad");
    expect(banner.text).toMatch(/Unauthorized/);
    expect(banner.text).toMatch(/re-paste/);
  });
});
