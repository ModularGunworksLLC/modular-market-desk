const BASE =
  "https://bids.auctionbypearce.com/auctions/46969-guns-gear--ammo-summer-auction";
const PEARCE = 1.19025;

function decode(s) {
  return String(s ?? "")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

async function scrape(extraQuery) {
  const all = [];
  for (let page = 1; page <= 15; page++) {
    const q = extraQuery ? `${extraQuery}&page=${page}` : `?page=${page}`;
    const url = BASE + q + (q.includes("?") ? "&" : "?") + "pageSize=100";
    const html = await (
      await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } })
    ).text();
    const cardRe = /data-lotnumber="(\d+)"[\s\S]*?<\/div><\/div><\/div>/g;
    let m;
    let n = 0;
    while ((m = cardRe.exec(html))) {
      const chunk = m[0];
      const lot = m[1];
      const titleM = chunk.match(/class="title">([^<]+)/);
      const bidM = chunk.match(/class="winning-bid-amount">\$([\d,]+\.\d{2})/);
      const bidsM = chunk.match(/<strong>Bids:<\/strong><span>(\d+)<\/span>/);
      const completed = /bidding complete|completed|pending/i.test(chunk);
      if (!titleM || !bidM) continue;
      all.push({
        lot,
        title: decode(titleM[1]),
        bid: parseFloat(bidM[1].replace(/,/g, "")),
        bids: bidsM ? parseInt(bidsM[1], 10) : 0,
        completed,
      });
      n++;
    }
    if (n === 0) break;
  }
  const seen = new Map();
  for (const l of all) seen.set(l.lot, l);
  return [...seen.values()];
}

const filtered = await scrape("?filter=(end_time_from:now)");
const all = await scrape("");

const lots = filtered.length ? filtered : all.filter((l) => !l.completed);

console.log("Still open (filtered):", filtered.filter((l) => !l.completed).length);
console.log("Total scraped:", lots.length);

function isPart(title) {
  const t = title.toLowerCase();
  if (
    /pistol|rifle|shotgun|revolver|carbine|firearm|ar-15|ar15|semi automatic rifle|semi-automatic rifle/.test(
      t
    )
  )
    return false;
  return /ammo|magazine|mag\b|holster|scope|stock|barrel|grip|case|box|cleaning|sight|mount|rest|arrow|knife|blade|sword|archery|reload|powder|dies|scale|tackle|bayonet|cheek|foregrip|panel|butt|choke|sling|upper|grip|ram-line|ramline|bushnell|burris|nikon|leupold|vortex|troy|safariland|blackhawk|pachmayr|houge|mossberg pistol grip|anderson|rossi 22/.test(
    t
  );
}

function masseyCompare(bid, targetNet) {
  const pearceIn = bid * PEARCE;
  const masseyIn = bid * 1.15;
  return { pearceIn: +pearceIn.toFixed(2), masseyIn: +masseyIn.toFixed(2), targetNet };
}

const parts = lots.filter((l) => !l.completed && isPart(l.title)).sort((a, b) => a.bid - b.bid);
const guns = lots
  .filter((l) => !l.completed && !isPart(l.title))
  .sort((a, b) => a.bid - b.bid);

console.log("\n=== PARTS FLIP LANE (your Massey playbook) ===");
console.log("Max ~$22 hammer on Pearce ≈ Massey $19 mags | folding stock paid $47.50\n");

const highlights = [
  { lot: "344", label: "2x 10/22 mags", ebay: "35-45 pair", masseyRef: 21.85 },
  { lot: "509", label: "Rossi 22 barrel", ebay: "~55", masseyRef: 54.63 },
  { lot: "322", label: "Ram-Line folder", ebay: "~90", masseyRef: 54.63 },
  { lot: "347", label: "Butler Creek 25/22 mag", ebay: "15-25", masseyRef: null },
  { lot: "346", label: "2x 22 mags", ebay: "25-40", masseyRef: null },
];

for (const h of highlights) {
  const l = lots.find((x) => x.lot === h.lot);
  if (!l) continue;
  const { pearceIn } = masseyCompare(l.bid, null);
  const estNet30 = 30; // rough eBay net target
  const ok = pearceIn + 10 < estNet30 ? "THIN" : l.bid <= 22 ? "PERSONAL OK" : "CHECK";
  console.log(
    `Lot ${l.lot} $${l.bid} (${l.bids}b) all-in $${pearceIn} | eBay ${h.ebay} | Massey ref $${h.masseyRef ?? "—"} | ${l.title.slice(0, 45)}`
  );
}

console.log("\n=== ALL OPEN PARTS under $40 ===");
for (const l of parts.filter((p) => p.bid <= 40)) {
  console.log(
    `Lot ${l.lot} $${l.bid} (${l.bids}b) all-in $${(l.bid * PEARCE).toFixed(2)} | ${l.title.slice(0, 52)}`
  );
}

console.log("\n=== OPEN GUNS (GB lane) ===");
for (const l of guns) {
  console.log(`Lot ${l.lot} $${l.bid} (${l.bids}b) | ${l.title.slice(0, 58)}`);
}

console.log("\n=== 10/22 ecosystem ===");
for (const l of lots.filter((x) => /10.?22|10-22|ruger.*mag|ram.?line/i.test(x.title))) {
  console.log(
    `Lot ${l.lot} ${l.completed ? "CLOSED" : "OPEN"} $${l.bid} | ${l.title.slice(0, 55)}`
  );
}
