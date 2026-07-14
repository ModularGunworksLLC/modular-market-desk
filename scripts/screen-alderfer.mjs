import { readFileSync, writeFileSync } from "fs";

const round2 = (x) => Math.round((x + Number.EPSILON) * 100) / 100;
const fvf = (G) => {
  const c = Math.min(G, 15000);
  return 0.06 * Math.min(c, 400) + 0.04 * Math.max(0, c - 400);
};

// Alderfer acquisition (solo handgun ship to AL)
const BP = 0.23;
const CC = 0.03;
const MULT = (1 + BP) * (1 + CC);
const FIXED_SOLO = 15 + 11 + 40; // reg + pack + ship est
const FIXED_BATCH = 15 + 11 + 25; // batch: cheaper combined ship

function allIn(hammer, fixed = FIXED_SOLO) {
  return round2(hammer * MULT + fixed);
}
function netAtSale(hammer, sale, fixed = FIXED_SOLO) {
  return round2(sale - fvf(sale) - 5 - allIn(hammer, fixed));
}
function maxHammer(sale, target = 50, fixed = FIXED_SOLO) {
  const maxAllIn = sale - fvf(sale) - 5 - target;
  return round2(Math.max(0, (maxAllIn - fixed) / MULT));
}

/** OA comps from Pearce thread — exact variant may differ; verify before bidding */
const OA = [
  { keys: ["model 422", "422"], fmv: 400, low: 340, high: 450, label: "S&W 422" },
  { keys: ["m&p 40", "m&p40", "mp 40 shield", "m&p 40 shield"], fmv: 255, low: 215, high: 310, label: "S&W M&P40/Shield40" },
  { keys: ["m&p 9 shield", "mp 9 shield", "m&p shield 9"], fmv: 280, low: 250, high: 320, label: "S&W M&P9 Shield", guess: true },
  { keys: ["22/45", "22-45"], fmv: 320, low: 280, high: 380, label: "Ruger 22/45", guess: true },
  { keys: ["buckmark", "buck mark"], fmv: 350, low: 300, high: 400, label: "Browning Buck Mark", guess: true },
  { keys: ["glock 17", "g17"], fmv: 420, low: 380, high: 480, label: "Glock 17 Gen4", guess: true },
  { keys: ["p365"], fmv: 450, low: 400, high: 520, label: "Sig P365", guess: true },
  { keys: ["p238"], fmv: 550, low: 480, high: 620, label: "Sig P238", guess: true },
  { keys: ["m96a1", "m9a1", "beretta 96"], fmv: 450, low: 400, high: 500, label: "Beretta M96A1", guess: true },
  { keys: ["m&p 9c", "mp 9c"], fmv: 350, low: 300, high: 400, label: "S&W M&P9C", guess: true },
  { keys: ["mark ii target", "mark ii"], fmv: 380, low: 320, high: 440, label: "Ruger Mark II", guess: true },
  { keys: ["ppk"], fmv: 650, low: 550, high: 750, label: "Walther PPK", guess: true },
  { keys: ["model 439"], fmv: 400, low: 350, high: 450, label: "S&W 439", guess: true },
  { keys: ["model 669"], fmv: 350, low: 300, high: 400, label: "S&W 669", guess: true },
  { keys: ["model 908"], fmv: 300, low: 260, high: 340, label: "S&W 908", guess: true },
  { keys: ["model 639"], fmv: 500, low: 450, high: 550, label: "S&W 639", guess: true },
  { keys: ["glock 20"], fmv: 500, low: 450, high: 550, label: "Glock 20", guess: true },
  { keys: ["hi power", "hi-power", "hp semi"], fmv: 700, low: 600, high: 800, label: "Browning Hi-Power", guess: true },
  { keys: ["hk usp", "heckler & koch usp", "usp tactical"], fmv: 750, low: 650, high: 850, label: "HK USP", guess: true },
  { keys: ["colt commander"], fmv: 700, low: 600, high: 800, label: "Colt Commander", guess: true },
  { keys: ["ruger 57"], fmv: 450, low: 400, high: 500, label: "Ruger 57", guess: true },
  { keys: ["m&p 380 shield ez", "shield ez"], fmv: 350, low: 300, high: 400, label: "S&W Shield EZ", guess: true },
  { keys: ["neos", "u22"], fmv: 250, low: 220, high: 280, label: "Beretta U22 Neos", guess: true },
  { keys: ["model 10-8", "model 10"], fmv: 450, low: 400, high: 500, label: "S&W Model 10", guess: true },
  { keys: ["model 36"], fmv: 550, low: 480, high: 620, label: "S&W 36", guess: true },
  { keys: ["model 66"], fmv: 650, low: 580, high: 720, label: "S&W 66", guess: true },
  { keys: ["gp100", "gp 100"], fmv: 550, low: 500, high: 600, label: "Ruger GP100", guess: true },
  { keys: ["9422"], fmv: 700, low: 600, high: 800, label: "Winchester 9422", guess: true },
];

function matchOa(name) {
  const n = (name || "").toLowerCase();
  for (const row of OA) {
    if (row.keys.some((k) => n.includes(k))) return row;
  }
  return null;
}

function isCollector(name) {
  const n = (name || "").toLowerCase();
  return /antique|percussion|black powder|muzzle|flintlock|cap and ball|pre-1898|damascus|engraved|gold inlay|presentation|museum|cased|commemorative|wwi|wwii|belleau|occupation|scarce|rare |nib |consecutive|custom consecutive|battle of|german occupation|brazilian contract|early ruger|harquebus|blunderbuss|yellow boy|1866|1873|luger p08|mauser c96|martini|trapdoor|krag|gewehr|nagant|mosin nagant|carcano|lee-enfield|springfield armory|colt paterson|walker colt|dragoon|pepperbox|derringer(?!.*semi)|single shot rifle(?!.*22)|fox ae|bottega|687eell|grand european|featherlight|ithaca 37r deluxe|winchester 101|ah fox|sauer bbf|bockbuchsflinte|mle 1892|mle 1873|st etienne|ed brown custom|heckler & koch usp tactical(?!.*)/i.test(
    n
  ) || /ed brown custom|smith & wesson 41 semi|smith & wesson 52-2|colt 1911 us army|colt officers acp|k-22 masterpiece|model 1905|model 30-1|dan wesson 40-v8s|dan wesson 740|dan wesson 15-2|dan wesson \.44|dan wesson w-12|blackhawk bisley|blackhawk combo|super blackhawk|single six combo|bear cat|bearcat|vaquero|highway patrolman|model 28-2|model 65-2|model 64-2|model 686|model 586|model 29-3|model 52|baby browning|model 21a|model 1935|948 semi|pony semi|iver johnson|intratech|ab-10|taurus\/spesco|taurus\/int model 86|taurus model 80|taurus model 85|taurus model 669/.test(
    n
  );
}

function isModernLiquid(name) {
  const n = (name || "").toLowerCase();
  if (isCollector(n)) return false;
  return /glock \d|sig sauer p\d|ruger (22\/45|mark ii|mark iv|mark iii|sr22|lcp|max-9|security-9|57 )|smith & wesson (m&p|model 422|model 439|model 639|model 908|model 669|shield)|beretta (m9|m96|96a1|apx|u22|neos)|walther (ppk|ppq|pdp|creed)|canik|springfield (hellcat|echelon|xd)|cz p\d|hk (vp9|usp)|fn (509|fnx)|browning (buckmark|buck mark|hi power|hi-power)|kimber |taurus (g2|g3|gx2|pt111)|mossberg 500|winchester 9422|ruger 10\/22|henry h001|marlin 39|marlin 60|ar-15|ar15|palmetto|psa |aero precision|anderson|smith & wesson mp15|ruger ar-556|springfield saint/i.test(
    n
  );
}

function verdict(net, bid, max, oaGuess) {
  if (net == null) return "NEEDS OA";
  if (net < 50) return bid <= max * 0.85 ? "WATCH (bid too high)" : "COOKED";
  if (bid > max) return "OVER MAX";
  if (bid >= max * 0.9) return "AT CEILING";
  return oaGuess ? "CANDIDATE (verify OA)" : "CANDIDATE";
}

const data = JSON.parse(readFileSync("scripts/alderfer-lots.json", "utf8"));
const screened = [];

for (const l of data.lots) {
  if (!isModernLiquid(l.name)) continue;
  const oa = matchOa(l.name);
  const bid = l.bid ?? l.start ?? 0;
  const fmv = oa?.fmv ?? null;
  const net = fmv ? netAtSale(bid, fmv) : null;
  const netBatch = fmv ? netAtSale(bid, fmv, FIXED_BATCH) : null;
  const max = fmv ? maxHammer(fmv) : null;
  const maxBatch = fmv ? maxHammer(fmv, 50, FIXED_BATCH) : null;
  const v = verdict(net, bid, max, oa?.guess);
  if (v === "COOKED" && bid > (max ?? 0) * 1.1) continue; // skip dead lots unless close
  screened.push({
    lot: l.lot,
    name: l.name,
    bid,
    min_bid: l.min_bid,
    bid_count: l.bid_count,
    oa_label: oa?.label ?? null,
    oa_fmv: fmv,
    oa_source: oa ? (oa.guess ? "ESTIMATE — paste OA" : "Pearce OA") : null,
    net_solo: net,
    net_batch: netBatch,
    max_hammer_solo: max,
    max_hammer_batch: maxBatch,
    verdict: v,
    url: l.url,
  });
}

screened.sort((a, b) => {
  const rank = (v) =>
    ({ "CANDIDATE": 0, "CANDIDATE (verify OA)": 1, "AT CEILING": 2, "WATCH (bid too high)": 3, "OVER MAX": 4, "COOKED": 5, "NEEDS OA": 6 }[v] ?? 9);
  const d = rank(a.verdict) - rank(b.verdict);
  if (d !== 0) return d;
  return (b.net_solo ?? -999) - (a.net_solo ?? -999);
});

writeFileSync("scripts/alderfer-candidates.json", JSON.stringify(screened, null, 2));

const tiers = {
  green: screened.filter((s) => s.verdict === "CANDIDATE" && (s.net_solo ?? 0) >= 50),
  yellow: screened.filter((s) => s.verdict.startsWith("CANDIDATE") || s.verdict === "AT CEILING" || s.verdict === "WATCH"),
  homework: screened.filter((s) => s.verdict === "NEEDS OA" || (s.oa_source?.includes("ESTIMATE") && s.net_solo >= 30)),
};

console.log("=== TIER 1: OA-backed, room at bid (solo ship) ===");
for (const s of tiers.green) {
  console.log(`Lot ${s.lot} $${s.bid} | ${s.oa_label} FMV $${s.oa_fmv} | net $${s.net_solo} | max $${s.max_hammer_solo} | ${s.name?.slice(0, 50)}`);
}
console.log("\n=== TIER 2: Verify OA / at ceiling / watch ===");
for (const s of tiers.yellow.filter((x) => !tiers.green.includes(x))) {
  console.log(`Lot ${s.lot} $${s.bid} | ${s.oa_label ?? "?"} | net $${s.net_solo ?? "—"} | max $${s.max_hammer_solo ?? "—"} | ${s.verdict} | ${s.name?.slice(0, 45)}`);
}
console.log("\nTotal screened:", screened.length);
