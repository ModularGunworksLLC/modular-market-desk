import { describe, expect, it } from "vitest";

import { assessMatchSuspicion, IDENTITY_RATIO_NOGO } from "./match-suspicion";

describe("assessMatchSuspicion", () => {
  it("flags OA median far above lot bid (ammo/wrong leaf)", () => {
    const s = assessMatchSuspicion({
      bidOrCost: 100,
      oaMedian: 700,
      oaCount: 40,
    });
    expect(s.suspicious).toBe(true);
    expect(s.oaToBidRatio).toBeCloseTo(7, 0);
    expect(s.warnings[0]).toMatch(/Suspicious OA match/);
  });

  it("passes when OA and bid are in band", () => {
    const s = assessMatchSuspicion({
      bidOrCost: 450,
      oaMedian: 500,
      oaCount: 20,
      webAgreement: "agrees",
    });
    expect(s.suspicious).toBe(false);
  });

  it("adds web disagreement warnings", () => {
    const s = assessMatchSuspicion({
      bidOrCost: 500,
      oaMedian: 520,
      oaCount: 15,
      webMedian: 900,
      webAgreement: "web_higher",
    });
    expect(s.suspicious).toBe(true);
    expect(s.warnings.some((w) => /Web street/i.test(w))).toBe(true);
  });

  it("4× OA/hammer is the GO withhold threshold", () => {
    expect(IDENTITY_RATIO_NOGO).toBe(4);
    const warn = assessMatchSuspicion({ bidOrCost: 100, oaMedian: 300, oaCount: 20 });
    expect(warn.suspicious).toBe(true);
    expect(warn.oaToBidRatio! < IDENTITY_RATIO_NOGO).toBe(true);
    const kill = assessMatchSuspicion({ bidOrCost: 65, oaMedian: 411, oaCount: 29 });
    expect(kill.oaToBidRatio!).toBeGreaterThanOrEqual(IDENTITY_RATIO_NOGO);
  });
});
