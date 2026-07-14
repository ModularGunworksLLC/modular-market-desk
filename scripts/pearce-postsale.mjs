const AUCTION =
  "https://bids.auctionbypearce.com/auctions/46969-guns-gear--ammo-summer-auction";
const M = 1.19025;

const OA = [
  { keys: ["mete mc9", "mc9"], label: "Canik MC9", fmv: 440 },
  { keys: ["tp9 sf elite", "sf elite"], label: "TP9 SF Elite", fmv: 285 },
  { keys: ["tp9 sf", "tp9sf"], label: "TP9 SF", fmv: 245, exclude: ["elite", "sfx", "mete"] },
  { keys: ["model 422", "422"], label: "S&W 422", fmv: 400 },
  { keys: ["m&p 40", "mp 40"], label: "M&P 40", fmv: 255, exclude: ["shield"] },
  { keys: ["sw9", "sw 9"], label: "SW9VE", fmv: 180 },
  { keys: ["pt111", "g2c", "g3c"], label: "Taurus budget", fmv: 155 },
  { keys: ["22/45", "mark iii 22/45"], label: "Ruger 22/45", fmv: 290 },
  { keys: ["buck mark", "buckmark"], label: "Buck Mark", fmv: 350 },
  { keys: ["model 915"], label: "S&W 915", fmv: 301 },
  { keys: ["p-10m", "p10m"], label: "CZ P-10M", fmv: 303 },
  { keys: ["px4"], label: "Beretta PX4", fmv: 445 },
  { keys: ["glock 19"], label: "Glock 19", fmv: 450 },
  { keys: ["10/22"], label: "Ruger 10/22", fmv: 350, exclude: ["magazine", "mag "] },
];

function decode(s) {
  return String(s ?? "")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

async function scrapeAll() {
  const all = [];
  for (let page = 1; page <= 12; page++) {
    const res = await fetch(`${AUCTION}?page=${page}&pageSize=100`, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; MMD-Desk/1.0)" },
    });
    if (!res.ok) break;
    const html = await res.text();
    const cardRe = /data-lotnumber="(\d+)"[\s\S]*?<\/div><\/div><\/div>/g;
    let n = 0;
    let m;
    while ((m = cardRe.exec(html))) {
      const chunk = m[0];
      const lot = m[1];
      const titleM = chunk.match(/class="title">([^<]+)/);
      const bidM = chunk.match(/class="winning-bid-amount">\$([\d,]+\.\d{2})/);
      const bidsM = chunk.match(/<strong>Bids:<\/strong><span>(\d+)<\/span>/);
      const passed = /passed|no sale|unsold|did not sell/i.test(chunk);
      const completed = /bidding complete|completed|sold/i.test(chunk);
      if (!titleM || !bidM) continue;
      all.push({
        lot,
        title: decode(titleM[1]),
        bid: parseFloat(bidM[1].replace(/,/g, "")),
        bids: bidsM ? parseInt(bidsM[1], 10) : 0,
        passed,
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

function matchOa(title) {
  const n = title.toLowerCase();
  for (const row of OA) {
    if (row.exclude?.some((x) => n.includes(x))) continue;
    if (row.keys.some((k) => n.includes(k))) return row;
  }
  return null;
}

const round2 = (x) => Math.round((x + Number.EPSILON) * 100) / 100;
const fvf = (G) => {
  const c = Math.min(G, 15000);
  return round2(0.06 * Math.min(c, 400) + 0.04 * Math.max(0, c - 400));
};
const net = (h, s) => round2(s - fvf(s) - 5 - h * M);
const maxH = (s) => round2(Math.floor((s - fvf(s) - 5 - 50) / M));

const lots = await scrapeAll();
console.log("Scraped", lots.length, "lots");

const passed = lots.filter((l) => l.passed);
console.log("Marked passed in HTML:", passed.length);
if (passed.length) {
  for (const l of passed.slice(0, 20)) {
    console.log(" PASSED", l.lot, "$" + l.bid, l.title.slice(0, 50));
  }
}

const yours = new Set(["135", "308"]);
const hits = [];
for (const l of lots) {
  if (yours.has(l.lot)) continue;
  const oa = matchOa(l.title);
  if (!oa) continue;
  const n = net(l.bid, oa.fmv);
  if (n >= 40) {
    hits.push({ ...l, oa, net: n, max: maxH(oa.fmv) });
  }
}
hits.sort((a, b) => b.net - a.net);

console.log("\n=== OA-matched lots with structural margin (may be SOLD) ===");
for (const h of hits.slice(0, 20)) {
  console.log(
    `Lot ${h.lot} $${h.bid} (${h.bids}b) | ${h.oa.label} | net $${h.net} | max $${h.max} | ${h.title.slice(0, 45)}`
  );
}

const lowModern = lots.filter((l) => {
  if (yours.has(l.lot)) return false;
  const t = l.title.toLowerCase();
  if (/ammo|magazine|mag\b|holster|scope|knife|coin|silver|parts|upper|lower|barrel only/.test(t)) return false;
  return /pistol|revolver|rifle|shotgun|carbine|semi automatic|semi-automatic/.test(t) && l.bid <= 150;
});
console.log("\n=== Modern guns closing <= $150 (ask staff if unsold) ===");
for (const l of lowModern.sort((a, b) => a.bid - b.bid).slice(0, 15)) {
  const oa = matchOa(l.title);
  console.log(
    `Lot ${l.lot} $${l.bid} (${l.bids}b) ${oa ? `| est net $${net(l.bid, oa.fmv)} @ ${oa.label}` : "| NEEDS OA"} | ${l.title.slice(0, 50)}`
  );
}
