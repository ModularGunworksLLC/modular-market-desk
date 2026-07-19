/**
 * Purge parts/junk OK rows + targeted slug-retry for known firearms.
 */
import { createClient } from "@libsql/client";

import { fetchTgvHtml } from "../src/lib/tgv/client";
import { parseTgvModelHtml, type TgvCategory } from "../src/lib/tgv/parse";
import { TGV_ORIGIN, tgvPathCandidates } from "../src/lib/tgv/resolve-url";
import { markTgvModelStatus, upsertTgvPage } from "../src/lib/tgv/store";

async function main() {
  const c = createClient({ url: "file:./data/desk.db" });
  const junk = await c.execute(`
    SELECT id, manufacturer, model FROM tgv_models
    WHERE last_status = 'ok'
      AND (
        lower(model) LIKE '%ring%'
        OR lower(model) LIKE '%base%'
        OR lower(model) LIKE '%barreled%'
        OR lower(model) LIKE '%bullet%'
        OR lower(model) LIKE '%conversion%'
      )
  `);
  console.log("junk candidates", junk.rows.length);
  for (const r of junk.rows) {
    await c.execute("DELETE FROM tgv_sold_comps WHERE model_row_id = ?", [r.id]);
    await c.execute("DELETE FROM tgv_model_stats WHERE model_row_id = ?", [r.id]);
    await c.execute("DELETE FROM tgv_models WHERE id = ?", [r.id]);
    console.log("deleted", r.manufacturer, r.model);
  }

  const targets: Array<[string, string, TgvCategory]> = [
    ["Bergara", "Ridge", "rifle"],
    ["Bergara", "Timber", "rifle"],
    ["CVA", "Cascade XT", "rifle"],
    ["Christensen Arms", "Traverse", "rifle"],
    ["Winchester", "Super X4", "shotgun"],
    ["Henry", "Henry Singleshot", "rifle"],
    ["Savage Arms", "Mark II", "rifle"],
    ["Heritage", "R92", "rifle"],
    ["Smith and Wesson", "1854 Lever", "rifle"],
    ["Traditions", "Outfitter G3", "rifle"],
  ];

  for (const [mfr, model, cat] of targets) {
    const cands = tgvPathCandidates(mfr, model, cat).slice(0, 5);
    let hit = false;
    for (const cand of cands) {
      const fetched = await fetchTgvHtml(`${TGV_ORIGIN}${cand.path}`, { usePlaywright: true });
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
        manufacturer: mfr,
        model,
        category: cand.category,
        gapReason: "oa_missing",
        parsed: {
          ...parsed,
          soldCount: parsed.soldCount > 0 ? parsed.soldCount : parsed.solds.length,
        },
        tgvPath: cand.path,
      });
      console.log("OK", mfr, model, "->", cand.path, "PP used", parsed.privatePartyUsed);
      hit = true;
      break;
    }
    if (!hit) {
      console.log("NF", mfr, model, "tried", cands.map((x) => x.path).join(", "));
      await markTgvModelStatus({
        manufacturer: mfr,
        model,
        category: cat,
        status: "not_found",
        error: "targeted retry miss",
        tgvPath: cands[0]?.path,
      });
    }
    await new Promise((r) => setTimeout(r, 1200));
  }

  const counts = await c.execute(
    "SELECT last_status, COUNT(*) n FROM tgv_models GROUP BY last_status ORDER BY n DESC",
  );
  console.log("status", counts.rows);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
