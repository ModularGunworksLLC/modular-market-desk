import { readFileSync, writeFileSync } from "node:fs";

function parseCsvLine(line) {
  const out = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ",") {
      out.push(cur);
      cur = "";
    } else cur += c;
  }
  out.push(cur);
  return out;
}

function actionFor(r) {
  if (r.verdict === "GO") return "BID";
  if (r.verdict === "NO-GO") return "PASS";
  if (r.status === "SKIP") return "SKIP";
  return "NO COMPS";
}

const text = readFileSync("tmp-pearce-lots-10-231.csv", "utf8").trim().split(/\r?\n/);
const rows = text
  .slice(1)
  .map(parseCsvLine)
  .map((c) => ({
    lot: c[0],
    lotN: Number(String(c[0]).replace(/\D/g, "")) || 0,
    label: (c[1] || "").replace(/\s+/g, " ").trim(),
    bid: c[2] ? Number(c[2]) : null,
    maxBid: c[3] ? Number(c[3]) : null,
    head: c[4] ? Number(c[4]) : null,
    verdict: c[5] || "",
    sold: c[6] ? Number(c[6]) : 0,
    p25: c[7] ? Number(c[7]) : null,
    med: c[8] ? Number(c[8]) : null,
    net: c[9] ? Number(c[9]) : null,
    status: c[10] || "",
    note: (c[11] || "").slice(0, 120),
  }))
  .filter((r) => r.lotN >= 10 && r.lotN <= 231)
  .sort((a, b) => a.lotN - b.lotN)
  .map((r) => ({ ...r, action: actionFor(r) }));

const bid = rows.filter((r) => r.action === "BID");
const pass = rows.filter((r) => r.action === "PASS");
const noComps = rows.filter((r) => r.action === "NO COMPS");
const skip = rows.filter((r) => r.action === "SKIP");

const money = (n) => (n == null || Number.isNaN(n) ? "" : `$${Math.round(n)}`);

const md = [];
md.push("# Pearce 47513 — Lots 10–231 (lot order)");
md.push("");
md.push("## Fee basis (this auction only)");
md.push("");
md.push("- **Auction terms (Pearce):** 15% buyer’s premium; **+3%** if paying by card; local pickup → **$0** inbound ship.");
md.push("- **Modeled buy all-in:** hammer × **1.1845** (15% BP then 3% CC on that total).");
md.push("- **Your rules:** customer pays outbound ship + their CC; you pay **$3** GB listing; **$50** target profit/gun.");
md.push("- Spot-check OA MatchNote before bidding.");
md.push("");
md.push(`| Bucket | Count |`);
md.push(`|---|---:|`);
md.push(`| **BID** | ${bid.length} |`);
md.push(`| **PASS** | ${pass.length} |`);
md.push(`| **NO COMPS** | ${noComps.length} |`);
md.push(`| **SKIP** | ${skip.length} |`);
md.push(`| **Total** | ${rows.length} |`);
md.push("");
md.push("## Full list — lot 10 → 231");
md.push("");
md.push("| Lot | Action | Current | MaxBid | Headroom | Sold med | Sold # | Gun |");
md.push("|---:|:---|---:|---:|---:|---:|---:|---|");
for (const r of rows) {
  const max = r.action === "BID" || r.action === "PASS" ? money(r.maxBid) : "";
  const head =
    r.action === "BID"
      ? money(r.head)
      : r.action === "PASS" && r.head != null
        ? money(-Math.abs(r.head))
        : "";
  md.push(
    `| ${r.lot} | **${r.action}** | ${money(r.bid)} | ${max} | ${head} | ${r.sold ? money(r.med) : ""} | ${r.sold || ""} | ${r.label.slice(0, 72)} |`,
  );
}

writeFileSync("tmp-pearce-bid-pass.md", md.join("\n"));

const csvLines = [
  "Lot,Action,CurrentBid,MaxBid,Headroom,SoldMedian,SoldCount,Gun,MatchNote",
  ...rows.map((r) =>
    [
      r.lot,
      r.action,
      r.bid ?? "",
      r.maxBid ?? "",
      r.head ?? "",
      r.med ?? "",
      r.sold || "",
      JSON.stringify(r.label),
      JSON.stringify(r.note),
    ].join(","),
  ),
];
writeFileSync("tmp-pearce-bid-pass.csv", csvLines.join("\n"));
writeFileSync("tmp-pearce-bid-pass-by-lot.csv", csvLines.join("\n"));

writeFileSync(
  "tmp-pearce-bid-pass.json",
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      sort: "lot",
      tallies: { bid: bid.length, pass: pass.length, noComps: noComps.length, skip: skip.length, total: rows.length },
      rows,
    },
    null,
    2,
  ),
);

console.log(
  JSON.stringify(
    {
      tallies: { bid: bid.length, pass: pass.length, noComps: noComps.length, skip: skip.length, total: rows.length },
      first: rows.slice(0, 3).map((r) => ({ lot: r.lot, action: r.action })),
      last: rows.slice(-3).map((r) => ({ lot: r.lot, action: r.action })),
      files: ["tmp-pearce-bid-pass.md", "tmp-pearce-bid-pass.csv"],
    },
    null,
    2,
  ),
);
