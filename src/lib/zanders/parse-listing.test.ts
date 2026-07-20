import { describe, expect, it } from "vitest";

import { parseZandersItemCount, parseZandersListingHtml } from "./parse-listing";
import { splitZandersDescription } from "./upsert";

const SAMPLE = `
<p class="toolbar-amount" id="toolbar-amount">
  Items <span class="toolbar-number">1</span>-<span class="toolbar-number">60</span> of <span class="toolbar-number">2559</span>
</p>
<a class="product-item-link" href="https://shop2.gzanders.com/firearms/pistols/glock-19.html">GLOCK 19 GEN5 9MM</a>
<span class="text-light-gray">Item Number: </span><span>GLOCK19</span>
<span class="text-light-gray">UPC: </span><span>764503037248</span>
<span class="text-light-gray">Available:</span><span class="value">12</span>
<div class="price-box"><span class="price">$449.00</span></div>
MSRP: $599.00
`;

describe("zanders listing parse", () => {
  it("reads toolbar count", () => {
    expect(parseZandersItemCount(SAMPLE)).toBe(2559);
  });

  it("parses a product card", () => {
    const rows = parseZandersListingHtml(SAMPLE, "pistol");
    expect(rows).toHaveLength(1);
    expect(rows[0]?.sku).toBe("GLOCK19");
    expect(rows[0]?.upc).toBe("764503037248");
    expect(rows[0]?.dealerPrice).toBe(449);
    expect(rows[0]?.qty).toBe(12);
  });

  it("splits description into make/model", () => {
    expect(splitZandersDescription("SIG SAUER P320 XFULL")).toEqual({
      manufacturer: "SIG SAUER",
      model: "P320 XFULL",
    });
  });
});
