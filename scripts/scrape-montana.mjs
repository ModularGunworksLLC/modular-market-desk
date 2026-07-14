const BASE =
  "https://bids.nationalauctionusa.com/auctions/46223-montana-sporting-auction-spring-2026";

function decode(s) {
  return String(s ?? "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function extractLots(html) {
  const lots = [];
  const cardRe = /data-lotnumber="(\d+)"[\s\S]*?<\/div><\/div><\/div>/g;
  let m;
  while ((m = cardRe.exec(html))) {
    const chunk = m[0];
    const lot = m[1];
    const titleM = chunk.match(/class="title">([^<]+)/);
    const bidM = chunk.match(/class="winning-bid-amount">\$([\d,]+\.\d{2})/);
    const bidsM = chunk.match(/<strong>Bids:<\/strong><span>(\d+)<\/span>/);
    const closed = /bidding complete|lot closed|completed/i.test(chunk);
    if (!titleM || !bidM) continue;
    lots.push({
      lot,
      title: decode(titleM[1]),
      bid: parseFloat(bidM[1].replace(/,/g, "")),
      bids: bidsM ? parseInt(bidsM[1], 10) : 0,
      closed,
    });
  }
  return lots;
}

async function scrapeAll() {
  const map = new Map();
  for (let page = 1; page <= 20; page++) {
    const url = `${BASE}?page=${page}&pageSize=300`;
    const html = await (
      await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } })
    ).text();
    const batch = extractLots(html);
    if (!batch.length) break;
    for (const l of batch) map.set(l.lot, l);
    if (batch.length < 300) break;
  }
  return [...map.values()].sort((a, b) => Number(a.lot) - Number(b.lot));
}

const lots = await scrapeAll();
console.log("Total lots:", lots.length);
console.log("Open:", lots.filter((l) => !l.closed).length);

const gunRe =
  /\b(pistol|rifle|shotgun|revolver|carbine|handgun|firearm|ar-15|ar15|glock|sig sauer|smith|wesson|beretta|taurus|canik|ruger|remington|mossberg|benelli|browning|winchester|hk |heckler|colt|springfield armory|daniel defense|christensen|tikka|savage|henry|kimber|walther|cz |fn |barrett|kel.?tec|iwi |m&p|px4|1911|10\/22|870|500|590)\b/i;

const guns = lots.filter((l) => gunRe.test(l.title) && !/barrel only|magazine|holster|scope|mount|grip|stock|case only|upper only|lower only|parts kit|ammo|ammunition|rounds|grain|gauge shot|shotshell|box of/i.test(l.title));

console.log("\n=== FIREARMS (sample, by bid) ===");
for (const l of guns.sort((a, b) => a.bid - b.bid).slice(0, 40)) {
  console.log(
    `Lot ${l.lot} $${l.bid} (${l.bids}b) ${l.closed ? "CLOSED" : "OPEN"} | ${l.title.slice(0, 70)}`
  );
}

console.log("\n=== HIGH-END / WATCH ===");
for (const l of guns.filter((g) => g.bid >= 500).sort((a, b) => b.bid - a.bid).slice(0, 25)) {
  console.log(`Lot ${l.lot} $${l.bid} (${l.bids}b) | ${l.title.slice(0, 75)}`);
}

import { writeFileSync } from "fs";
writeFileSync("scripts/montana-lots.json", JSON.stringify(lots, null, 2));
console.log("\nWrote scripts/montana-lots.json");
