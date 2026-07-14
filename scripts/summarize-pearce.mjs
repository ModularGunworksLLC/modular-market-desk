import { readFileSync } from "fs";

const r = JSON.parse(readFileSync("scripts/pearce-results.json", "utf8"));
const all = [...r.go, ...r.nearMiss, ...r.overBid];

const isFirearm = (x) => {
  const t = x.title.toLowerCase();
  if (
    /ammo|round|grain|qty|box|slug|bullet|cartridge|magazine|cheek|grip|stock|scope only|holster|cleaning|target|mount|sling|buffer|bolt carrier|upper receiver|lower receiver|barrel only|parts kit|conversion|sterling|silver|coin|pill box|bracelet|chain|money clip/i.test(
      t,
    )
  )
    return false;
  return /rifle|pistol|revolver|shotgun|carbine|handgun|ar-15|ar15|glock|smith|remington model|ruger|beretta|winchester model|mossberg|savage|kel.?tec|hi-point|bond arms|thompson center|browning|1100|px4|usp|m&p|hellbreaker|spikes|contender|sub.?2000|lc carbine|rossi|tokarev|black aces|radikal|g force|revolution|rock island|canik|sig|springfield|taurus|henry|marlin|benelli|colt |kimber|heritage|diamondback|anderson|aero|daniel defense|iwi|zastava|stoeger|tristar|weatherby|bergara|howa|bushmaster|windham|dpms|core 15|adler|silver eagle|winchester 38/i.test(
    t,
  );
};

const firearms = all.filter(isFirearm);
const byLot = new Map();
for (const x of firearms) byLot.set(x.lot, x);
const unique = [...byLot.values()];

const go = unique
  .filter((x) => x.verdict === "GO" && x.soldCount > 0)
  .sort((a, b) => (b.headroom ?? 0) - (a.headroom ?? 0));
const near = unique
  .filter(
    (x) =>
      x.verdict !== "GO" &&
      x.soldCount > 0 &&
      x.headroom != null &&
      x.headroom > -75,
  )
  .sort((a, b) => (b.headroom ?? 0) - (a.headroom ?? 0));
const over = unique
  .filter((x) => x.headroom != null && x.headroom < -50 && x.soldCount > 0)
  .sort((a, b) => a.headroom - b.headroom);

const fmt = (x) =>
  `Lot ${String(x.lot).padStart(3)} | bid $${String(x.bid).padStart(4)} | walk-away $${x.walkAway?.toFixed(0).padStart(4) ?? "   -"} | headroom $${x.headroom?.toFixed(0).padStart(4) ?? "   -"} | P25 $${x.p25Sold ?? "-"} | ${x.title.slice(0, 60)}`;

console.log("=== ASSUMPTIONS ===");
console.log(JSON.stringify(r.assumptions, null, 2));
console.log(`\n=== FIREARM GO (${go.length}) — bid at or below walk-away, $50+ profit at P25 ===\n`);
go.forEach((x) => console.log(fmt(x)));
console.log(`\n=== NEAR MISS (${near.length}) — close but NO-GO at current bid ===\n`);
near.slice(0, 25).forEach((x) => console.log(fmt(x)));
console.log(`\n=== AVOID — bid way over walk-away ===\n`);
over.slice(0, 15).forEach((x) => console.log(fmt(x)));
