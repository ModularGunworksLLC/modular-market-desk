const DESK = process.env.DESK_BASE ?? "https://desk.modulargunworks.com";

const probes = [
  { mfr: "SIG Sauer", model: "Romeo 5", cat: "optic", cond: "new" },
  { mfr: "SIG SAUER", model: "ROMEO5", cat: "optic", cond: "new" },
  { mfr: "Sig Sauer", model: "Romeo5 Gen II", cat: "optic", cond: "new" },
  { mfr: "SIG Sauer", model: "Romeo 5", cat: "accessory", cond: "new" },
  { mfr: "SIG Sauer", model: "Romeo 5", cat: "handgun", cond: "used" },
];

for (const p of probes) {
  const body = {
    manufacturer: p.mfr,
    model: p.model,
    caliber: "",
    category: p.cat,
    condition: p.cond,
    targetAcquisitionCost: 110.24,
    inboundShip: 15,
    autoComps: true,
    targetProfit: 25,
    outboundShip: 12,
    listingUpgrades: 3,
  };
  const res = await fetch(`${DESK}/api/evaluate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120_000),
  });
  const j = await res.json();
  console.log(
    `${p.mfr} / ${p.model} (${p.cat}):`,
    j.sourceStatus?.gba,
    "| sold:",
    j.result?.sold?.count,
    "median:",
    j.result?.sold?.median,
    "| asking:",
    j.asking?.count,
    "median:",
    j.asking?.median,
  );
}
