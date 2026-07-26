/**
 * One-shot: ingest Pearce auction → classify → summarize bid-ready firearm lots.
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";

import { ingestHibidAuction, lotsToBatchCsv } from "../src/lib/auctions/hibid";
import { classifyLotTitle } from "../src/lib/auctions/lot-kind";
import { parseBatchSheet } from "../src/lib/batch/parse";

const url =
  process.argv[2] ||
  "https://bids.auctionbypearce.com/auctions/47513-july-guns-gear-and-ammo-auction";

async function main() {
  console.log("> ingesting", url);
  const ingested = await ingestHibidAuction(url, { maxPages: 12 });
  const firearms = ingested.firearmLots;
  const csv = lotsToBatchCsv(firearms, 15);
  const parsed = parseBatchSheet(csv, { defaultBuyerPremiumPct: 15 });
  const evaluable = parsed.rows.filter((r) => !r.unresolved);

  const outPath = join(process.cwd(), "data", "pearce-47513-firearms.csv");
  writeFileSync(outPath, csv, "utf8");

  console.log(
    JSON.stringify(
      {
        host: ingested.host,
        totalLots: ingested.lots.length,
        firearmLotsIngest: firearms.length,
        skippedNonFirearm: ingested.skipped,
        hasListingIncrements: ingested.hasListingIncrements,
        warnings: [...ingested.warnings, ...parsed.warnings],
        evaluableAfterParse: evaluable.length,
        excludedByParse: parsed.rows.filter((r) => r.excludeFromPricing).length,
        csvPath: outPath,
        sampleFirearms: evaluable.slice(0, 12).map((r) => ({
          lot: r.lot,
          title: r.rawTitle.slice(0, 90),
          make: r.manufacturer,
          model: r.model,
          caliber: r.caliber,
          currentBid: r.currentBid,
          nextBid: r.requiredBid,
          kind: classifyLotTitle(r.rawTitle),
        })),
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
