const BASE =
  "https://bids.auctionbypearce.com/auctions/46969-guns-gear--ammo-summer-auction";

async function fullScrape() {
  const all = new Map();
  for (let page = 1; page <= 10; page++) {
    const html = await (
      await fetch(`${BASE}?page=${page}&pageSize=100`, {
        headers: { "User-Agent": "Mozilla/5.0" },
      })
    ).text();
    const cardRe = /data-lotnumber="(\d+)"[\s\S]*?<\/div><\/div><\/div>/g;
    let m;
    let n = 0;
    while ((m = cardRe.exec(html))) {
      const chunk = m[0];
      const lot = m[1];
      const titleM = chunk.match(/class="title">([^<]+)/);
      const bidM = chunk.match(/class="winning-bid-amount">\$([\d,]+\.\d{2})/);
      if (!titleM || !bidM) continue;
      all.set(lot, {
        lot,
        title: titleM[1].replace(/&amp;/g, "&").trim(),
        bid: parseFloat(bidM[1].replace(/,/g, "")),
        closed: /bidding complete|lot closed|sold/i.test(chunk),
      });
      n++;
    }
    if (n === 0) break;
  }
  return all;
}

const all = await fullScrape();
console.log("Total lots in catalog:", all.size);
for (const lot of ["135", "308", "344", "346", "347", "119"]) {
  const l = all.get(lot);
  console.log(l ? `${lot}: ${l.closed ? "CLOSED" : "OPEN"} $${l.bid} ${l.title}` : `${lot}: missing`);
}

const open = [...all.values()].filter((l) => !l.closed);
console.log("\nOpen count:", open.length);

// Best parts under $25 hammer for eBay lane
const PEARCE = 1.19025;
const partRe =
  /magazine|mag\b|barrel|stock|holster|scope|grip|mount|foregrip|cheek|ram.?line|10.?22|10-22|butler creek|safariland|blackhawk|pachmayr|houge|anderson.*barrel|ak.*stock|rossi/i;
const parts = open
  .filter((l) => partRe.test(l.title))
  .sort((a, b) => a.bid - b.bid);

console.log("\n=== PARTS worth a look on pickup (≤$25 hammer) ===");
for (const l of parts.filter((p) => p.bid <= 25)) {
  console.log(
    `Lot ${l.lot} $${l.bid} all-in $${(l.bid * PEARCE).toFixed(2)} | ${l.title.slice(0, 55)}`
  );
}

console.log("\n=== OPEN FIREARMS ===");
const gunRe = /pistol|rifle|shotgun|revolver|carbine|firearm|ar-15|ar15|semi automatic/i;
for (const l of open.filter((x) => gunRe.test(x.title)).sort((a, b) => a.bid - b.bid)) {
  console.log(`Lot ${l.lot} $${l.bid} | ${l.title.slice(0, 58)}`);
}
