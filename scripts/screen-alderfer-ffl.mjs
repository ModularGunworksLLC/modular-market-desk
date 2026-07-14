import { writeFileSync } from "fs";

const round2 = (x) => Math.round((x + Number.EPSILON) * 100) / 100;
const fvf = (G) => {
  const c = Math.min(G, 15000);
  return round2(0.06 * Math.min(c, 400) + 0.04 * Math.max(0, c - 400));
};

const MULT = 1.23 * 1.03; // 23% BP + 3% CC, no tax
const FIRST_FIXED = 51; // $11 pack + ~$40 ship
const ADDON_FIXED = 6; // additional handgun in same shipment

function allIn(hammer, slot = "first") {
  return round2(hammer * MULT + (slot === "first" ? FIRST_FIXED : ADDON_FIXED));
}
function netAtSale(hammer, sale, slot = "first") {
  return round2(sale - fvf(sale) - 5 - allIn(hammer, slot));
}
function maxHammer(sale, target = 50, slot = "first") {
  const fixed = slot === "first" ? FIRST_FIXED : ADDON_FIXED;
  return round2(Math.max(0, (sale - fvf(sale) - 5 - target - fixed) / MULT));
}

/** OA comps: confirmed = user-pasted; estimate = structural only until OA pasted */
const OA = [
  { keys: ["22/45", "22-45"], label: "Ruger 22/45 MKIII Target", fmv: 290, low: 255, high: 305, confirmed: true },
  { keys: ["model 422"], label: "S&W 422", fmv: 400, low: 340, high: 450, confirmed: true },
  { keys: ["m&p 40 shield", "mp 40 shield"], label: "S&W M&P40 Shield", fmv: 255, low: 215, high: 310, confirmed: true },
  { keys: ["m&p 9 shield", "mp 9 shield"], label: "S&W M&P9 Shield", fmv: 280, low: 250, high: 320, confirmed: false },
  { keys: ["m&p 9c", "mp 9c"], label: "S&W M&P9C", fmv: 350, low: 300, high: 400, confirmed: false },
  { keys: ["shield ez"], label: "S&W Shield EZ", fmv: 350, low: 300, high: 400, confirmed: false },
  { keys: ["model 439"], label: "S&W 439", fmv: 400, low: 350, high: 450, confirmed: false },
  { keys: ["model 669"], label: "S&W 669", fmv: 350, low: 300, high: 400, confirmed: false },
  { keys: ["model 908"], label: "S&W 908", fmv: 300, low: 260, high: 340, confirmed: false },
  { keys: ["model 639"], label: "S&W 639", fmv: 500, low: 450, high: 550, confirmed: false },
  { keys: ["glock 17 gen 4", "glock 17"], label: "Glock 17 Gen4", fmv: 420, low: 380, high: 480, confirmed: false },
  { keys: ["glock 20"], label: "Glock 20", fmv: 500, low: 450, high: 550, confirmed: false },
  { keys: ["p365"], label: "Sig P365", fmv: 450, low: 400, high: 520, confirmed: false },
  { keys: ["p238"], label: "Sig P238", fmv: 550, low: 480, high: 620, confirmed: false },
  { keys: ["m96a1", "beretta 96"], label: "Beretta M96A1", fmv: 450, low: 400, high: 500, confirmed: false },
  { keys: ["buckmark", "buck mark"], label: "Browning Buck Mark", fmv: 350, low: 300, high: 400, confirmed: false },
  { keys: ["mark ii target", "mark ii"], label: "Ruger Mark II Target", fmv: 380, low: 320, high: 440, confirmed: false },
  { keys: ["ppk"], label: "Walther PPK", fmv: 650, low: 550, high: 750, confirmed: false },
  { keys: ["colt commander"], label: "Colt Commander", fmv: 700, low: 600, high: 800, confirmed: false },
  { keys: ["ruger 57"], label: "Ruger 57", fmv: 450, low: 400, high: 500, confirmed: false },
  { keys: ["u22 neos", "neos"], label: "Beretta U22 Neos", fmv: 250, low: 220, high: 280, confirmed: false },
  { keys: ["model 10-8", "model 10"], label: "S&W Model 10", fmv: 450, low: 400, high: 500, confirmed: false },
  { keys: ["model 66"], label: "S&W 66", fmv: 650, low: 580, high: 720, confirmed: false },
  { keys: ["model 65"], label: "S&W 65", fmv: 600, low: 520, high: 680, confirmed: false },
  { keys: ["model 36"], label: "S&W 36", fmv: 550, low: 480, high: 620, confirmed: false },
  { keys: ["gp 100", "gp100"], label: "Ruger GP100", fmv: 550, low: 500, high: 600, confirmed: false },
  { keys: ["9422"], label: "Winchester 9422", fmv: 700, low: 600, high: 800, confirmed: false },
  { keys: ["hi power", "hi-power"], label: "Browning Hi-Power", fmv: 700, low: 600, high: 800, confirmed: false },
  { keys: ["hk usp", "heckler & koch usp"], label: "HK USP", fmv: 750, low: 650, high: 850, confirmed: false },
  { keys: ["10/22"], label: "Ruger 10/22", fmv: 350, low: 300, high: 400, confirmed: false },
  { keys: ["henry h001"], label: "Henry H001", fmv: 350, low: 300, high: 400, confirmed: false },
  { keys: ["marlin model 60", "glenfield model 60"], label: "Marlin 60", fmv: 200, low: 175, high: 225, confirmed: false },
  { keys: ["mossberg 500"], label: "Mossberg 500", fmv: 350, low: 300, high: 400, confirmed: false },
  { keys: ["remington 870"], label: "Remington 870", fmv: 400, low: 350, high: 450, confirmed: false },
  { keys: ["kahr k9"], label: "Kahr K9", fmv: 400, low: 350, high: 450, confirmed: false },
  { keys: ["tisas", "1911a1 service"], label: "Tisas 1911", fmv: 400, low: 350, high: 450, confirmed: false },
];

function matchOa(name) {
  const n = (name || "").toLowerCase();
  for (const row of OA) {
    if (row.keys.some((k) => n.includes(k))) return row;
  }
  return null;
}

function isAntiqueCollector(name) {
  const n = (name || "").toLowerCase();
  return (
    /antique|percussion|black powder|muzzle|flintlock|cap and ball|pre-1898|damascus|blunderbuss|yellow boy|1866|1873|luger p08|mauser c96|martini-henry|trapdoor|krag|gewehr|nagant|mosin|carcano|lee-enfield|springfield armory model|colt paterson|walker colt|engraved|gold inlay|presentation|museum|cased matched|commemorative|belleau|german occupation|brazilian contract|consecutive pair|ed brown custom|bottega|fox ae|687eell|grand european|featherlight deluxe|winchester 101 |ah fox|bockbuchsflinte|mle 1892|mle 1873|st etienne|nib browning|scarce smith|custom consecutive|rare dan wesson|rare antique pond|us colt 1911 us army|heckler & koch usp tactical/.test(
      n
    ) ||
    /iver johnson|intratech|ab-10|jennings|bryco|raven mp-25|lorcin|hi-point|cobra|phoenix|jimenez|saturday night|tip up double action|derringer/.test(
      n
    )
  );
}

function isLiquid(name) {
  const n = (name || "").toLowerCase();
  if (isAntiqueCollector(n)) return false;
  return (
    /glock|sig sauer|smith & wesson|s&w|ruger|beretta|walther|canik|springfield|cz |hk |heckler|mossberg|henry |marlin |winchester|browning|remington 870|kahr|taurus (g2|g3|pt111)|tisas|rock island|palmetto|10\/22|22\/45|buckmark|buck mark|m&p|shield|p365|p238|ppk|422|439|639|908|669|9422|hi power|hi-power|colt commander|gp100|gp 100/.test(
      n
    ) && /pistol|revolver|rifle|shotgun|carbine|semi automatic|semi-automatic|lever action|pump action|bolt action/.test(n)
  );
}

function verdict(net, bid, max, confirmed) {
  if (net == null) return "NEEDS_OA";
  if (net >= 50 && bid <= max) {
    if (bid >= max * 0.92) return confirmed ? "AT_CEILING" : "VERIFY_AT_CEILING";
    return confirmed ? "GO" : "VERIFY_GO";
  }
  if (net >= 50 && bid > max) return "OVER_MAX";
  if (net >= 25 && bid <= max) return confirmed ? "WATCH" : "VERIFY_WATCH";
  return "COOKED";
}

const items = await fetch(
  "https://bid.alderferauction.com/api/auctions/161804/items?page=1&per_page=500"
).then((r) => r.json());

const lots = items.items
  .filter((i) => {
    const lot = String(i.lot_identifier || "");
    if (!lot || /^0+$/.test(lot)) return false;
    const n = (i.name || "").toLowerCase();
    if (/terms|preview|consignment|shipping information|auction information|sold as is/.test(n))
      return false;
    return true;
  })
  .map((i) => ({
    lot: i.lot_identifier,
    name: i.name,
    bid: i.api_bidding_state?.high?.amount ?? i.bidding_configuration?.start_amount ?? null,
    min_bid: i.api_bidding_state?.minimum_bid_amount,
    bid_count: i.api_bidding_state?.accepted_bid_count ?? 0,
    url: `https://bid.alderferauction.com/ui/auctions/161804/lots/${i.id}`,
  }));

const screened = [];
for (const l of lots) {
  if (!isLiquid(l.name)) continue;
  const oa = matchOa(l.name);
  const bid = l.bid ?? 0;
  const netFirst = oa ? netAtSale(bid, oa.fmv, "first") : null;
  const netAddon = oa ? netAtSale(bid, oa.fmv, "addon") : null;
  const maxFirst = oa ? maxHammer(oa.fmv, 50, "first") : null;
  const maxAddon = oa ? maxHammer(oa.fmv, 50, "addon") : null;
  const v = verdict(netFirst, bid, maxFirst, oa?.confirmed);
  screened.push({
    ...l,
    oa_label: oa?.label ?? null,
    oa_fmv: oa?.fmv ?? null,
    oa_confirmed: oa?.confirmed ?? false,
    net_first: netFirst,
    net_addon: netAddon,
    max_first: maxFirst,
    max_addon: maxAddon,
    verdict: v,
  });
}

const rank = {
  GO: 0,
  VERIFY_GO: 1,
  AT_CEILING: 2,
  VERIFY_AT_CEILING: 3,
  WATCH: 4,
  VERIFY_WATCH: 5,
  OVER_MAX: 6,
  NEEDS_OA: 7,
  COOKED: 8,
};
screened.sort((a, b) => {
  const d = (rank[a.verdict] ?? 9) - (rank[b.verdict] ?? 9);
  if (d !== 0) return d;
  return (b.net_first ?? -999) - (a.net_first ?? -999);
});

writeFileSync("scripts/alderfer-screen-ffl.json", JSON.stringify(screened, null, 2));

const go = screened.filter((s) => s.verdict === "GO");
const verifyGo = screened.filter((s) => s.verdict === "GO" || s.verdict === "VERIFY_GO");
const watch = screened.filter((s) => /WATCH|CEILING/.test(s.verdict));
const cooked = screened.filter((s) => s.verdict === "COOKED");

console.log("FFL stack: hammer x 1.2669 + $51 first / +$6 add-on | GB: FVF + $5 | floor $50");
console.log("Liquid lots screened:", screened.length, "/", lots.length);
console.log("");
console.log("=== CONFIRMED OA — GO @ current bid (first gun ship) ===");
for (const s of go) {
  console.log(
    `Lot ${s.lot} $${s.bid} min $${s.min_bid} (${s.bid_count}b) | ${s.oa_label} FMV $${s.oa_fmv} | net $${s.net_first} | max $${s.max_first} | ${s.name?.slice(0, 48)}`
  );
}
console.log("");
console.log("=== VERIFY OA — structurally GO (paste comps) ===");
for (const s of verifyGo.filter((x) => x.verdict === "VERIFY_GO")) {
  console.log(
    `Lot ${s.lot} $${s.bid} | est FMV $${s.oa_fmv} | net $${s.net_first} | max $${s.max_first} | ${s.name?.slice(0, 48)}`
  );
}
console.log("");
console.log("=== WATCH / AT CEILING ===");
for (const s of watch) {
  console.log(
    `Lot ${s.lot} $${s.bid} | ${s.verdict} | net $${s.net_first} | max $${s.max_first} | ${s.oa_label} | ${s.name?.slice(0, 42)}`
  );
}
console.log("");
console.log("=== COOKED (OA-matched, skip) ===");
for (const s of cooked) {
  console.log(`Lot ${s.lot} $${s.bid} | ${s.oa_label} | net $${s.net_first} | max $${s.max_first}`);
}
