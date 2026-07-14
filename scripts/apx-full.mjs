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

console.log("GBA:", j.sourceStatus?.gba);
console.log("\nSOLD (86 comps):", r?.sold);
console.log("\nASKING:", j.asking ?? r?.asking);
console.log("\nVerdict:", r?.verdict, "| Max bid:", r?.maxBid, "| All-in:", r?.allInCost);
console.log("\nScenarios:");
for (const s of r?.scenarios ?? []) {
  console.log(
    `  ${s.label}: profit $${s.netProfit} (${s.marginPct}%) via ${s.bestRoute} @ G=$${s.listPrice ?? "?"}`,
  );
}

// Undercut flip math @ list prices (buyer pays ship/card on GB)
function fvf(G) {
  const c = Math.min(G, 15000);
  return Math.round((0.06 * Math.min(c, 400) + 0.04 * Math.max(0, c - 400)) * 100) / 100;
}
const allIn = 255.87;
for (const list of [299, 319, 339, 349, 359, 379]) {
  const profit = Math.round((list - fvf(list) - 8 - allIn) * 100) / 100;
  const tag = profit >= 50 ? "GO" : profit >= 0 ? "BE" : "PASS";
  console.log(`  List $${list}: net ~$${profit} (${tag})`);
}
