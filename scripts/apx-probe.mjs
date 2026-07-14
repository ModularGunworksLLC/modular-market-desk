const DESK = process.env.DESK_BASE ?? "https://desk.modulargunworks.com";

const body = {
  manufacturer: "Beretta",
  model: "APX A1 Carry",
  caliber: "9mm",
  category: "handgun",
  condition: "new",
  targetAcquisitionCost: 240.87,
  inboundShip: 15,
  buyerPremiumPct: 0,
  autoComps: true,
  targetProfit: 50,
  minMarginPct: 15,
  outboundShip: 30,
  listingUpgrades: 3,
};

const res = await fetch(`${DESK}/api/evaluate`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
  signal: AbortSignal.timeout(300_000),
});

const j = await res.json();
const r = j.result;

function scrubGba(gba) {
  if (!gba || typeof gba !== "object") return gba;
  const out = { ...gba };
  if (typeof out.error === "string") {
    out.error = out.error.replace(/Bearer\s+eyJ[^\s"]+/gi, "Bearer [redacted]");
  }
  return out;
}

console.log(
  JSON.stringify(
    {
      gba: scrubGba(j.sourceStatus?.gba),
      error: j.error,
      verdict: r?.verdict,
      sold: r?.sold,
      asking: r?.asking,
      askingCount: j.asking?.count,
      maxBid: r?.maxBid,
      allInCost: r?.allInCost,
      scenarios: r?.scenarios?.map((s) => ({
        label: s.label,
        netProfit: s.netProfit,
        marginPct: s.marginPct,
        bestRoute: s.bestRoute,
        listPrice: s.listPrice,
      })),
      wholesale: j.wholesale,
      catalogMatch: j.catalogMatch,
    },
    null,
    2,
  ),
);
