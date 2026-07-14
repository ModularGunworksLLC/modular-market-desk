import { evaluateDeal } from "../src/lib/arbitrage/evaluate.ts";

const EFF = 15.5; // card payment — BP only, no separate CC fee
const TARGET = 50;

function sheet(input: {
  lot: string;
  bid: number;
  ship: number;
  cat: string;
  p25: number;
  label: string;
  note?: string;
}) {
  const { lot, bid, ship, cat, p25, label, note = "" } = input;
  const outbound = cat === "handgun" ? 45 : 60;
  const r = evaluateDeal(
    {
      targetAcquisitionCost: bid,
      inboundShip: ship,
      buyerPremiumPct: EFF,
      outboundShip: outbound,
      listingUpgrades: 3,
      targetProfit: TARGET,
      minMarginPct: 0,
      buyerPaysOutboundShip: true,
      buyerPaysCardFee: true,
      category: cat,
      manufacturer: "",
      model: "",
      caliber: "",
      upc: "",
      mpn: "",
    },
    {
      count: 50,
      p25,
      median: Math.round(p25 * 1.15 * 100) / 100,
      p75: Math.round(p25 * 1.3 * 100) / 100,
      low: Math.round(p25 * 0.9 * 100) / 100,
      high: Math.round(p25 * 1.5 * 100) / 100,
    },
  );
  const walk = r.maxBid;
  const inc = cat === "handgun" ? 2.5 : 5;
  const head = Math.round((walk - bid) * 100) / 100;
  const status = bid <= walk ? "HOLD" : bid <= walk + inc ? "COOKED" : "WALK";
  return { lot, label, bid, allIn: r.allInCost, walk: Math.round(walk * 100) / 100, headroom: head, verdict: r.verdict, p25, net: r.netProfit, status, note };
}

const lots = [
  { lot: "2077", bid: 230, ship: 45, cat: "handgun", p25: 325, label: "Ruger Mark II SS .22", note: "Manual P25 — GBA matched M77 rifle" },
  { lot: "943", bid: 52.5, ship: 45, cat: "handgun", p25: 300, label: "Springfield XD 9mm +3 mag/holster", note: "Manual P25 — NOT Prodigy" },
  { lot: "3202", bid: 92.5, ship: 45, cat: "handgun", p25: 320, label: "Walther SP22 M1 + case", note: "Manual P25 — Walther SP22" },
  { lot: "3169", bid: 155, ship: 55, cat: "rifle", p25: 525, label: "Win M70 .270 + Bushnell Banner", note: "Desk GBA 161 sold" },
  { lot: "903", bid: 50, ship: 55, cat: "shotgun", p25: 390, label: "Panzer Mag12 + box/2 mags/sights", note: "Desk GBA Mag12" },
  { lot: "3165", bid: 210, ship: 55, cat: "rifle", p25: 525, label: "Win M70 XTR + Tasco", note: "Desk GBA" },
  { lot: "927", bid: 82.5, ship: 55, cat: "rifle", p25: 380, label: "DPMS A-15 + Vortex Strike Eagle 1-6", note: "P25 bumped for scope" },
  { lot: "926", bid: 115, ship: 55, cat: "rifle", p25: 350, label: "DB15 + BSA red dot", note: "Desk GBA" },
  { lot: "910", bid: 105, ship: 55, cat: "rifle", p25: 300.75, label: "Anderson AM-15 + Pinty", note: "Desk GBA" },
  { lot: "909", bid: 67.5, ship: 45, cat: "handgun", p25: 213.75, label: "Hi-Point 1095 + Barska", note: "Desk GBA" },
  { lot: "901", bid: 55, ship: 55, cat: "shotgun", p25: 197.5, label: "Mossberg 500A wood", note: "Desk GBA tight" },
];

for (const l of lots) console.log(JSON.stringify(sheet(l)));
