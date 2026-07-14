const DESK = process.env.DESK_BASE ?? "https://desk.modulargunworks.com";

const probes = [
  {
    label: "Stag-15 used @467 all-in",
    body: {
      manufacturer: "Stag Arms",
      model: "Stag-15",
      caliber: "5.56",
      category: "rifle",
      condition: "used",
      targetAcquisitionCost: 467,
      inboundShip: 0,
      buyerPremiumPct: 0,
      autoComps: true,
      targetProfit: 50,
      minMarginPct: 15,
      outboundShip: 30,
      listingUpgrades: 3,
    },
  },
  {
    label: "Stag 15 used",
    body: {
      manufacturer: "Stag Arms",
      model: "Stag 15",
      caliber: "5.56 NATO",
      category: "rifle",
      condition: "used",
      targetAcquisitionCost: 467,
      inboundShip: 0,
      buyerPremiumPct: 0,
      autoComps: true,
      targetProfit: 50,
      outboundShip: 30,
      listingUpgrades: 3,
    },
  },
  {
    label: "Stag AR-15 used",
    body: {
      manufacturer: "Stag Arms",
      model: "AR-15",
      caliber: "5.56",
      category: "rifle",
      condition: "used",
      targetAcquisitionCost: 467,
      inboundShip: 0,
      buyerPremiumPct: 0,
      autoComps: true,
      targetProfit: 50,
      outboundShip: 30,
      listingUpgrades: 3,
    },
  },
  {
    label: "Romeo 5 Gen II new (optic only)",
    body: {
      manufacturer: "SIG Sauer",
      model: "Romeo 5 Gen II",
      caliber: "",
      category: "optic",
      condition: "new",
      targetAcquisitionCost: 110.24,
      inboundShip: 15,
      buyerPremiumPct: 0,
      autoComps: true,
      targetProfit: 25,
      outboundShip: 12,
      listingUpgrades: 3,
    },
  },
  {
    label: "Romeo5 used",
    body: {
      manufacturer: "SIG Sauer",
      model: "Romeo5",
      caliber: "",
      category: "optic",
      condition: "used",
      targetAcquisitionCost: 110.24,
      inboundShip: 15,
      buyerPremiumPct: 0,
      autoComps: true,
      targetProfit: 25,
      outboundShip: 12,
      listingUpgrades: 3,
    },
  },
];

function fvf(G) {
  const c = Math.min(G, 15000);
  return Math.round((0.06 * Math.min(c, 400) + 0.04 * Math.max(0, c - 400)) * 100) / 100;
}

function gbNet(list, outboundShip = 30) {
  return Math.round((list - fvf(list) - 5 - outboundShip - 0.03 * (list + outboundShip) - 3) * 100) / 100;
}

function localNet(list) {
  return Math.round((list / 1.09) * 100) / 100;
}

function flipAtLists(allIn, lists, outboundShip = 30) {
  for (const list of lists) {
    const net = Math.max(gbNet(list, outboundShip), localNet(list));
    const profit = Math.round((net - allIn) * 100) / 100;
    const tag = profit >= 50 ? "GO" : profit >= 0 ? "BE" : "PASS";
    console.log(`    List $${list}: net $${net} → profit $${profit} (${tag})`);
  }
}

for (const p of probes) {
  console.log(`\n=== ${p.label} ===`);
  const res = await fetch(`${DESK}/api/evaluate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(p.body),
    signal: AbortSignal.timeout(300_000),
  });
  const j = await res.json();
  const r = j.result;
  console.log("GBA:", j.sourceStatus?.gba ?? j.error);
  if (j.catalogMatch) console.log("Match:", j.catalogMatch);
  if (r?.sold) console.log("SOLD:", r.sold);
  if (j.asking) console.log("ASKING:", j.asking);
  if (r) {
    console.log(`Verdict: ${r.verdict} | Max bid: $${r.maxBid} | All-in: $${r.allInCost}`);
    if (r.scenarios?.length) {
      console.log("Desk scenarios:");
      for (const s of r.scenarios) {
        console.log(`  ${s.label}: $${s.netProfit} (${s.marginPct}%) ${s.bestRoute}`);
      }
    }
    const allIn = r.allInCost ?? p.body.targetAcquisitionCost + (p.body.inboundShip ?? 0);
    console.log("List price sweep (desk contract):");
    flipAtLists(allIn, [499, 549, 579, 599, 649, 699, 749, 799]);
  }
}

// Package math: gun $467 + optic $125 all-in
console.log("\n=== PACKAGE MATH (gun $467 + optic ~$125 all-in = $592) ===");
console.log("Break-even lists (local AL, tax backed out):");
flipAtLists(592, [599, 649, 679, 699, 749, 799], 30);
console.log("\nBreak-even lists (GunBroker shipped):");
for (const list of [649, 699, 749, 799, 849]) {
  const profit = Math.round((gbNet(list) - 592) * 100) / 100;
  console.log(`  List $${list} GB shipped: profit $${profit}`);
}
