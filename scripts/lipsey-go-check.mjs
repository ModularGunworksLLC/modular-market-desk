/**
 * Lipsey flip GO / BE / PASS — undercut tactic (buyer pays ship).
 *
 * Usage (one SKU):
 *   node scripts/lipsey-go-check.mjs <dealer> <gbFloor> [label]
 *
 * Usage (batch — dealer floor label triplets):
 *   node scripts/lipsey-go-check.mjs 240.87 379 "APX Carry" 484.24 499 "APX Tac"
 *
 * Optional env:
 *   INBOUND=15   (default)
 *   UNDERCUT=40  (list = floor - this)
 *   GO_MIN=50    (GO threshold)
 */

function fvf(G) {
  const c = Math.min(G, 15000);
  return Math.round((0.06 * Math.min(c, 400) + 0.04 * Math.max(0, c - 400)) * 100) / 100;
}

function minListFor(targetProfit, cost) {
  for (let list = Math.ceil(cost); list <= cost + 600; list += 1) {
    const p = list - fvf(list) - 8 - cost;
    if (p >= targetProfit) {
      return { list, profit: Math.round(p * 100) / 100 };
    }
  }
  return { list: null, profit: null };
}

function check({ dealer, floor, label = "" }) {
  const inbound = Number(process.env.INBOUND ?? 15);
  const undercut = Number(process.env.UNDERCUT ?? 40);
  const goMin = Number(process.env.GO_MIN ?? 50);

  const cost = Math.round((dealer + inbound) * 100) / 100;
  const list = floor - undercut;
  const profit = Math.round((list - fvf(list) - 8 - cost) * 100) / 100;
  const be = minListFor(0, cost);
  const go = minListFor(goMin, cost);

  let verdict = "PASS";
  if (profit >= goMin) verdict = "GO";
  else if (profit >= 0) verdict = "BE";

  const tag = label ? ` ${label}` : "";
  console.log(
    `${verdict.padEnd(4)} |${tag} dealer $${dealer} | all-in $${cost} | floor $${floor} | list $${list} | profit $${profit}`,
  );
  console.log(
    `      min BE list $${be.list} | min GO ($${goMin}) list $${go.list} | net @ list $${Math.round((list - fvf(list) - 8) * 100) / 100}`,
  );
}

const args = process.argv.slice(2);
if (args.length < 2 || args.length % 3 === 1) {
  console.error(
    "Usage: node scripts/lipsey-go-check.mjs <dealer> <gbFloor> [label] [dealer floor label ...]",
  );
  console.error("Example: node scripts/lipsey-go-check.mjs 240.87 379 \"APX Carry\"");
  process.exit(1);
}

for (let i = 0; i < args.length; ) {
  const dealer = parseFloat(args[i++]);
  const floor = parseFloat(args[i++]);
  const label = i < args.length && Number.isNaN(parseFloat(args[i])) ? args[i++] : "";
  if (!Number.isFinite(dealer) || !Number.isFinite(floor)) {
    console.error("Invalid dealer/floor:", args[i - 2], args[i - 1]);
    process.exit(1);
  }
  check({ dealer, floor, label });
  if (i < args.length) console.log("");
}
