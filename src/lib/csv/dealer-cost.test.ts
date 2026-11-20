import { describe, expect, it } from "vitest";

import { resolveDealerCost } from "./dealer-cost";

describe("resolveDealerCost", () => {
  it("does not treat MAP or MSRP as dealer cost when dealer price is blank", () => {
    expect(resolveDealerCost({ dealerPrice: "", mapPrice: "499", msrp: "549" })).toBeNull();
    expect(resolveDealerCost({ dealerPrice: null, msrp: "200" })).toBeNull();
    expect(resolveDealerCost({ dealerPrice: "$325.00", msrp: "499" })).toBe(325);
  });
});