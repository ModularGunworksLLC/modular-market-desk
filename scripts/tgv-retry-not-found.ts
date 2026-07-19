/**
 * Re-try tgv_models rows stuck in not_found with the new path-candidate logic.
 * Usage: npx tsx scripts/tgv-retry-not-found.ts [limit]
 */
import { createClient } from "@libsql/client";

import { fetchTgvHtml } from "../src/lib/tgv/client";
import { parseTgvModelHtml } from "../src/lib/tgv/parse";
import type { TgvCategory } from "../src/lib/tgv/parse";
import { TGV_ORIGIN, tgvPathCandidates } from "../src/lib/tgv/resolve-url";
import { markTgvModelStatus, upsertTgvPage } from "../src/lib/tgv/store";

async function main() {
  const limit = Number(process.argv[2] ?? 20);
  const c = createClient({ url: "file:./data/desk.db" });
  const nf = await c.execute(
    `SELECT manufacturer, model, category, tgv_path FROM tgv_models WHERE last_status = 'not_found' ORDER BY updated_at DESC LIMIT ?`,
    [limit],
  );

  console.log(`> retrying ${nf.rows.length} not_found rows`);
  let ok = 0;
  let still = 0;

  for (const row of nf.rows) {
    const manufacturer = String(row.manufacturer);
    const model = String(row.model);
    const category = String(row.category) as TgvCategory;
    const cands = tgvPathCandidates(manufacturer, model, category).slice(0, 6);
    let hit = false;

    for (const cand of cands) {
      const url = `${TGV_ORIGIN}${cand.path}`;
      const fetched = await fetchTgvHtml(url, { usePlaywright: true });
      if (!fetched.ok) continue;
      const parsed = parseTgvModelHtml(fetched.html, { path: cand.path });
      if (
        parsed.privatePartyUsed == null &&
        parsed.privatePartyNew == null &&
        parsed.solds.length === 0
      ) {
        continue;
      }
      await upsertTgvPage({
        manufacturer,
        model,
        category: cand.category,
        gapReason: "oa_missing",
        parsed: {
          ...parsed,
          soldCount: parsed.soldCount > 0 ? parsed.soldCount : parsed.solds.length,
        },
        tgvPath: cand.path,
      });
      console.log(`  OK  ${manufacturer} ${model} → ${cand.path}`);
      ok += 1;
      hit = true;
      break;
    }

    if (!hit) {
      still += 1;
      await markTgvModelStatus({
        manufacturer,
        model,
        category,
        status: "not_found",
        error: "Retry: no candidate matched",
        tgvPath: cands[0]?.path ?? String(row.tgv_path),
      });
      console.log(`  NF  ${manufacturer} ${model}`);
    }

    await new Promise((r) => setTimeout(r, 1500));
  }

  console.log(`> done ok=${ok} still_nf=${still}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
