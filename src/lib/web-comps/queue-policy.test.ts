import { describe, expect, it } from "vitest";

import {
  NO_OA_COMPS_LABEL,
  WEAK_FINAL_LABEL,
  webCompsBudgetLabel,
  webEnrichOutcome,
} from "./queue-policy";

describe("web-comps outcome labels", () => {
  it("names zero OA sales as no comps and no max bid", () => {
    const out = webEnrichOutcome({ soldCount: 0, reason: "not_queued" });
    expect(out.note).toBe(NO_OA_COMPS_LABEL);
    expect(out.phase).toBe("skipped");
  });

  it("says when the daily limit dropped a row", () => {
    const out = webEnrichOutcome({ soldCount: 0, reason: "daily_budget", maxPerDay: 50 });
    expect(out.phase).toBe("budget");
    expect(out.note).toBe(webCompsBudgetLabel(50));
    expect(out.note).toMatch(/50\/day/);
    expect(out.note).toMatch(/not looked up/);
  });

  it("gives Weak a final state instead of leaving it queued", () => {
    const out = webEnrichOutcome({
      soldCount: 0,
      reason: "finished",
      confidence: "medium",
      askCount: 4,
    });
    expect(out.phase).toBe("weak");
    expect(out.note).toContain(WEAK_FINAL_LABEL);
  });
});
