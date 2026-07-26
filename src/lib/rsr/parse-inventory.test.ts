import { describe, expect, it } from "vitest";

import { parseRsrInventoryLine, parseRsrInventoryText } from "./parse-inventory";

describe("parseRsrInventoryLine", () => {
  it("maps stock, upc, dealer price, qty, manufacturer", () => {
    const parts = Array.from({ length: 15 }, () => "");
    parts[0] = "ABC123";
    parts[1] = "736676037018";
    parts[2] = "RUGER LCP 380";
    parts[3] = "1";
    parts[5] = "259.00";
    parts[6] = "176.00";
    parts[8] = "12";
    parts[9] = "LCP";
    parts[10] = "Ruger";
    parts[11] = "3701";
    const row = parseRsrInventoryLine(parts.join(";"));
    expect(row).toMatchObject({
      sku: "ABC123",
      upc: "736676037018",
      dealerPrice: 176,
      msrp: 259,
      qty: 12,
      manufacturer: "Ruger",
      model: "LCP",
      category: "Handguns",
    });
  });

  it("parses multi-line inventory text", () => {
    const line =
      "SKU1;123456789012;Desc;18;X;20;10.5;1;5;ModelX;Federal;MPN1;";
    const rows = parseRsrInventoryText(line + "\n\n");
    expect(rows).toHaveLength(1);
    expect(rows[0]?.category).toBe("Ammunition");
  });
});
