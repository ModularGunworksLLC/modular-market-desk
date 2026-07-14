const BASE =
  "https://bids.auctionbypearce.com/auctions/46969-guns-gear--ammo-summer-auction";

function extractLots(html) {
  const lots = [];
  const cardRe = /data-lotnumber="(\d+)"[\s\S]*?<\/div><\/div><\/div>/g;
  let block;
  while ((block = cardRe.exec(html)) !== null) {
    const chunk = block[0];
    const lot = block[1];
    const titleM = chunk.match(/class="title">([^<]+)/);
    const bidM = chunk.match(/class="winning-bid-amount">\$([\d,]+\.\d{2})/);
    const bidsM = chunk.match(/<strong>Bids:<\/strong><span>(\d+)<\/span>/);
    if (!titleM) continue;
    lots.push({
      lot,
      title: titleM[1].trim().replace(/&amp;/g, "&"),
      bid: bidM ? parseFloat(bidM[1].replace(/,/g, "")) : null,
      bids: bidsM ? parseInt(bidsM[1], 10) : 0,
    });
  }
  return lots;
}

async function fetchLots(page, pageSize = 100) {
  const url = `${BASE}?page=${page}&pageSize=${pageSize}`;
  const html = await (await fetch(url)).text();
  return extractLots(html);
}

const all = [];
for (let p = 1; p <= 6; p++) {
  const lots = await fetchLots(p);
  process.stderr.write(`page ${p}: ${lots.length}\n`);
  if (lots.length === 0) break;
  all.push(...lots);
}
const seen = new Set();
const unique = all.filter((l) => {
  if (seen.has(l.lot)) return false;
  seen.add(l.lot);
  return !["0", "00", "000"].includes(l.lot);
});
import { writeFileSync } from "fs";
writeFileSync("scripts/pearce-lots.json", JSON.stringify(unique, null, 2));
console.error(`wrote ${unique.length} lots`);
