const DESK = "https://desk.modulargunworks.com";
const probes = [
  { manufacturer: "Smith & Wesson", model: "M&P15", caliber: "5.56", category: "rifle", condition: "new", targetAcquisitionCost: 725 },
  { manufacturer: "Beretta", model: "PX4 Storm", caliber: "9mm", category: "handgun", condition: "used", targetAcquisitionCost: 225 },
  { manufacturer: "HK", model: "USP 45", caliber: ".45 ACP", category: "handgun", condition: "used", targetAcquisitionCost: 400 },
];
for (const p of probes) {
  const body = { ...p, autoComps: true, targetProfit: 50, buyerPremiumPct: 18.5, inboundShip: 0 };
  const res = await fetch(`${DESK}/api/evaluate`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await res.json();
  const r = j.result ?? j;
  const p25 = r.scenarios?.find((s) => s.label === "P25") ?? r;
  console.log(p.model, "->", { verdict: p25.verdict, maxBid: p25.maxBid, profit: p25.netProfit, p25: r.sold?.p25, count: r.sold?.count, gba: j.sourceStatus?.gba });
}
