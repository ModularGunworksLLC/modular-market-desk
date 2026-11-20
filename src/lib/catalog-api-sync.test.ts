import { describe, expect, it } from "vitest";

import { vendorsToRefresh } from "./tracked-vendors";

describe("vendorsToRefresh", () => {
  it("refreshes Lipsey's, 2AW, and Chattanooga for all", () => {
    expect(vendorsToRefresh("all")).toEqual(["lipseys", "2ndamendmentwholesale", "chattanooga"]);
  });

  it("refreshes a single API vendor", () => {
    expect(vendorsToRefresh("lipseys")).toEqual(["lipseys"]);
  });

  it("rejects CSV-only houses", () => {
    expect(() => vendorsToRefresh("zanders")).toThrow(/Live catalog sync/);
  });
});
