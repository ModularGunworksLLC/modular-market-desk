import { describe, expect, it } from "vitest";

import { extractGunBrokerItemId, gunBrokerListingUrl } from "./gunbroker-url";

describe("gunBrokerListingUrl", () => {
  it("builds modern /item/{id} links from numeric ids", () => {
    expect(gunBrokerListingUrl(1077694457)).toBe("https://www.gunbroker.com/item/1077694457");
    expect(gunBrokerListingUrl("223900")).toBe("https://www.gunbroker.com/item/223900");
  });

  it("normalizes legacy index.htm?ItemID= links", () => {
    expect(gunBrokerListingUrl("https://www.gunbroker.com/item/index.htm?ItemID=12345")).toBe(
      "https://www.gunbroker.com/item/12345",
    );
    expect(gunBrokerListingUrl("https://www.gunbroker.com/item/index.htm?ItemID=1163871703")).toBe(
      "https://www.gunbroker.com/item/1163871703",
    );
  });

  it("passes through already-correct item URLs", () => {
    expect(gunBrokerListingUrl("https://www.gunbroker.com/item/999")).toBe(
      "https://www.gunbroker.com/item/999",
    );
  });
});

describe("extractGunBrokerItemId", () => {
  it("reads ItemID and URL-shaped fields", () => {
    expect(extractGunBrokerItemId({ ItemID: 12345 })).toBe("12345");
    expect(
      extractGunBrokerItemId({ ItemURL: "https://www.gunbroker.com/item/index.htm?ItemID=67890" }),
    ).toBe("67890");
  });
});
