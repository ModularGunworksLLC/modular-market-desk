function fvf(G) {
  const c = Math.min(G, 15000);
  return Math.round((0.06 * Math.min(c, 400) + 0.04 * Math.max(0, c - 400)) * 100) / 100;
}

function minListFor(targetProfit, cost) {
  for (let list = Math.ceil(cost); list <= cost + 500; list += 1) {
    const p = list - fvf(list) - 8 - cost;
    if (p >= targetProfit) {
      return { list, profit: Math.round(p * 100) / 100 };
    }
  }
  return null;
}

const items = [
  ["BEJAXN9208A1", "APX Carry", 240.87, 379],
  ["BEJAXA1F917FO", "APX A1 4.25 OR", 401.09, 519],
  ["BEJAXA1F921TAC", "APX A1 Tac", 484.24, 499],
  ["SI1911XCA45TWTP", "Sig 1911 X 45", 999.99, 1199],
  ["KM3200333", "Kimber Pro Carry II", 751.62, 949],
];

console.log("Undercut tactic: buyer pays ship | net = list - FVF - $8\n");
for (const [sku, name, dealer, floor] of items) {
  const cost = dealer + 15;
  const be = minListFor(0, cost);
  const p50 = minListFor(50, cost);
  const under = floor - 40;
  const profitUnder = Math.round((under - fvf(under) - 8 - cost) * 100) / 100;
  console.log(`${sku} | ${name}`);
  console.log(`  all-in $${cost} | GB floor ~$${floor}`);
  console.log(`  break-even list: $${be?.list} | $50-profit list: $${p50?.list}`);
  console.log(`  undercut @ $${under} (floor-40): profit $${profitUnder}`);
  console.log("");
}
