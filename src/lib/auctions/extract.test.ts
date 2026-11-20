import { describe, expect, it } from "vitest";

import { extractHibidCatalogLots } from "./hibid-catalog";
import {
  extractHibidMarkdownLots,
  extractHibidWhiteLabelLots,
  hibidAuctionHadBrowseFilter,
  hibidWhiteLabelPageUrl,
} from "./hibid";
import { extractProxibidEventLots } from "./proxibid";
import { isCloudflareBlock } from "./http";

const OLD_TILE = `
<div class="lot" data-lotnumber="8">
  <a href="/lot-details/8-glock"><img src="/img/8.jpg" alt="Glock 19"/></a>
  <div class="title">Glock 19 Gen5 9mm</div>
  <div class="winning-bid-amount">$420.00</div>
  <div class="bid-count-value"><strong>Bids:</strong><span>4</span></div>
</div>
`;

const TILE_TWO = `
<div class="lot lot-tile-two" data-lotid="7820890" data-lotnumber="1">
  <div class="imgWrapper">
    <a class="imgContainer" href="/auctions/47838/lot/7820890-marlin-1859">
      <img src="https://cdn.example/m.jpg" class="lot-img" alt="Marlin 1859 CB Lever Action Rifle cal. .45-70"/>
    </a>
  </div>
  <div class="details">
    <div class="lot-title"><div class="tile-two-lot-number">Lot <!-- -->1</div>Marlin 1859 CB Lever Action Rifle cal. .45-70 SN: MR69231G</div>
    <div class="lotDescription"></div>
    <div class="winning-bid-amount"><span class="current-bid"><span>Current Bid: </span><span class="tile-two-winning-bid">$640.00</span></span></div>
    <div class="bid-count"><div class="bid-count-value"><strong>Bids:</strong><span>46</span></div></div>
  </div>
</div>
<script>{"lot_number":"1","required_bid":650,"bid_increment_amount":25,"high_bid":640}</script>
`;

const CATALOG_APOLLO = `
{"__typename":"Lot","itemId":45386409,"lead":"KRISS USA Vector SDP G3 10MM Semi-Auto Tactical","lotNumber":"12","lotState":{"__typename":"LotState","bidCount":2,"highBid":1100,"minBid":1150},"pictures":[{"thumbnailLocation":"https://cdn.hibid.com/img.axd?id=1"}]}
{"__typename":"Lot","lead":"Winchester 9mm 115gr FMJ 50 rounds","lotNumber":"40","lotState":{"bidCount":0,"highBid":0,"minBid":25}}
`;

const PROX_EVENT = `
<div id="LotTable:102030485" class="lotBorder">
  <a href="/Walther-PPQ-9mm-Semi-Auto-Pistol/lotInformation/102030485">
    <img src="https://images.proxibid.com/1_1.jpg" alt="Walther PPQ 9mm Semi Auto Pistol" />
  </a>
  <h2 class="lotListTitle"><a href="/Walther-PPQ-9mm-Semi-Auto-Pistol/lotInformation/102030485">Walther PPQ 9mm Semi Auto Pistol</a></h2>
  <p class="lotListNumber"><a>Lot # 1</a></p>
  <input type="hidden" id="CurrentBid:102030485" name="currentBid" value="125" />
  <input type="hidden" id="lotNumber:102030485" value="1" />
</div>
<div id="LotTable:102030621" class="lotBorder">
  <h2 class="lotListTitle"><a href="/Ammo-Box/lotInformation/102030621">Winchester 9mm 115gr FMJ 50rd</a></h2>
  <input type="hidden" id="CurrentBid:102030621" name="currentBid" value="40" />
  <input type="hidden" id="lotNumber:102030621" value="2" />
</div>
`;

describe("extractHibidWhiteLabelLots", () => {
  it("reads the older title tile", () => {
    const lots = extractHibidWhiteLabelLots(OLD_TILE, "https://bids.auctionbypearce.com/");
    expect(lots).toHaveLength(1);
    expect(lots[0]?.lot).toBe("8");
    expect(lots[0]?.title).toBe("Glock 19 Gen5 9mm");
    expect(lots[0]?.currentBid).toBe(420);
    expect(lots[0]?.kind).toBe("firearm");
  });

  it("reads lot-tile-two + Apollo required_bid", () => {
    const lots = extractHibidWhiteLabelLots(TILE_TWO, "https://bids.christys.com/");
    expect(lots).toHaveLength(1);
    expect(lots[0]?.title).toContain("Marlin 1859");
    expect(lots[0]?.currentBid).toBe(640);
    expect(lots[0]?.requiredBid).toBe(650);
    expect(lots[0]?.bidIncrementAmount).toBe(25);
    expect(lots[0]?.bidCount).toBe(46);
    expect(lots[0]?.kind).toBe("firearm");
  });
});

describe("extractHibidMarkdownLots", () => {
  it("reads Lot N:title, last dollar, bids, and detail URL", () => {
    const md = `
Lot 0:Auction Information!
Lot 10:IWI Galil Ace SAR 5.45x39 Pistol
IWI Galil Ace SAR 5.45x39 Pistol, SN# G2017556
**Current High Bidder:**5141 (Nevada)
$725.00
**Bids:**20
[View Lot Details Now](https://bids.auctionbypearce.com/auctions/48128/lot/7886615-iwi)
Lot 11:Palmetto State Armory M16A4 5.56mm Rifle
$325.00
**Bids:**13
[View Lot Details Now](https://bids.auctionbypearce.com/auctions/48128/lot/7886622-psa)
`;
    const lots = extractHibidMarkdownLots(md, "https://bids.auctionbypearce.com/");
    expect(lots.map((l) => l.lot)).toEqual(["10", "11"]);
    expect(lots[0]?.title).toMatch(/Galil/i);
    expect(lots[0]?.currentBid).toBe(725);
    expect(lots[0]?.bidCount).toBe(20);
    expect(lots[0]?.detailUrl).toContain("7886615");
    expect(lots[0]?.kind).toBe("firearm");
    expect(lots[1]?.currentBid).toBe(325);
  });
});

describe("isCloudflareBlock", () => {
  it("flags 403 and challenge HTML", () => {
    expect(isCloudflareBlock(403, "")).toBe(true);
    expect(isCloudflareBlock(200, "<title>Just a moment...</title>")).toBe(true);
    expect(isCloudflareBlock(200, "<html><p>ok lots</p></html>")).toBe(false);
  });
});

describe("extractHibidCatalogLots", () => {
  it("reads Apollo lead / lotNumber / highBid / minBid", () => {
    const lots = extractHibidCatalogLots(CATALOG_APOLLO);
    expect(lots).toHaveLength(2);
    const kriss = lots.find((l) => l.lot === "12");
    expect(kriss?.title).toMatch(/KRISS/i);
    expect(kriss?.currentBid).toBe(1100);
    expect(kriss?.requiredBid).toBe(1150);
    expect(kriss?.kind).toBe("firearm");
    const ammo = lots.find((l) => l.lot === "40");
    expect(ammo?.currentBid).toBeNull();
    expect(ammo?.requiredBid).toBe(25);
    expect(ammo?.kind).toBe("ammo");
  });
});

describe("extractProxibidEventLots", () => {
  it("reads lotListTitle + hidden currentBid", () => {
    const lots = extractProxibidEventLots(PROX_EVENT, "https://www.proxibid.com");
    expect(lots).toHaveLength(2);
    expect(lots[0]?.lot).toBe("1");
    expect(lots[0]?.title).toBe("Walther PPQ 9mm Semi Auto Pistol");
    expect(lots[0]?.currentBid).toBe(125);
    expect(lots[0]?.kind).toBe("firearm");
    expect(lots[0]?.detailUrl).toContain("lotInformation/102030485");
    expect(lots[1]?.kind).toBe("ammo");
  });
});

describe("hibidWhiteLabelPageUrl", () => {
  const filtered =
    "https://bids.auctionbypearce.com/auctions/48128-boom-boom-pow-estate-and-consignment-auction-firearms-ammunition-and-accessories?filter=(end_time_from:now;category:244)&pageSize=100";

  it("strips HiBid browse filters so ingest pages the full sale", () => {
    expect(hibidAuctionHadBrowseFilter(filtered)).toBe(true);
    const page2 = hibidWhiteLabelPageUrl(filtered, 2, 100);
    expect(page2).not.toContain("filter");
    expect(page2).not.toContain("end_time_from");
    expect(page2).toContain("page=2");
    expect(page2).toContain("pageSize=100");
  });
});
