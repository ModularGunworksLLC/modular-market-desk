/**
 * Compare Pearce buy-sheet / batch results against synced OA SQLite cache.
 *
 * Usage:
 *   npx tsx scripts/compare-pearce-to-oa-db.ts
 *   OA_DB=file:./data/desk-lightsail-oa.db npx tsx scripts/compare-pearce-to-oa-db.ts
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { createClient } from "@libsql/client";

import { parseTitleBlob } from "../src/lib/batch/parse";
import {
  resolveQueryAttempts,
  resolveSelection,
  type OaDependencies,
  type OaManufacturerNode,
  type OaSelection,
} from "../src/lib/gba/scorer";

const PEARCE_BP = 1.1845;
const TARGET_PROFIT = 50;
const LISTING = 3;
const MASTER_FFL = 5;

type PearceRow = {
  lot: string;
  label: string;
  soldCount?: number | null;
  soldP25?: number | null;
  soldMedian?: number | null;
  maxBid?: number | null;
  currentBid?: number | null;
  matchNote?: string | null;
  matchScore?: number | null;
  oaCatalog?: {
    manufacturer?: string;
    model?: string;
    caliber?: string;
    modelId?: number;
    caliberId?: number;
    condition?: string;
    score?: number;
  } | null;
};

type DbStat = {
  condition: string;
  manufacturer: string;
  model: string;
  caliber: string;
  modelId: number;
  caliberId: number;
  soldCount: number;
  soldP25: number | null;
  soldMedian: number | null;
  askingCount: number;
};

function fvf(sell: number): number {
  const c = Math.min(sell, 15_000);
  return 0.06 * Math.min(c, 400) + 0.04 * Math.max(0, c - 400);
}

/** Desk-style max hammer at P25 with Pearce fees, buyer pays ship+CC, $3 list, $50 profit. */
function maxBidFromP25(p25: number): number {
  if (!(p25 > 0)) return 0;
  const net = p25 - fvf(p25) - MASTER_FFL - LISTING;
  const maxAllIn = net - TARGET_PROFIT;
  if (maxAllIn <= 0) return 0;
  return Math.round((maxAllIn / PEARCE_BP) * 100) / 100;
}

function parseMatchNote(note: string | null | undefined): {
  catalog: string;
  condition: string;
  sold: number | null;
  asking: number | null;
} | null {
  if (!note) return null;
  const m = String(note).match(
    /^auto:\s*(.+?)\s*\((Used|New)[^)]*\)(?:\s*-\s*(\d+)\s*sold(?:,\s*(\d+)\s*asking)?)?/i,
  );
  if (!m) return null;
  return {
    catalog: m[1]!.trim(),
    condition: m[2]!.toUpperCase() === "NEW" ? "NEW" : "USED",
    sold: m[3] != null ? Number(m[3]) : null,
    asking: m[4] != null ? Number(m[4]) : null,
  };
}

async function loadDepsFromCatalog(dbUrl: string): Promise<{
  deps: OaDependencies;
  statsByKey: Map<string, DbStat>;
  statsByIds: Map<string, DbStat>;
}> {
  const client = createClient({ url: dbUrl });
  const cat = await client.execute(
    "SELECT condition, manufacturer_id, manufacturer, is_common, model_id, model, caliber_id, caliber FROM oa_catalog",
  );
  const stats = await client.execute(
    `SELECT condition, manufacturer, model, caliber, model_id, caliber_id,
            sold_count, sold_p25, sold_median, asking_count
     FROM oa_market_stats`,
  );
  client.close();

  const buckets: Record<string, Map<number, OaManufacturerNode>> = {
    NEW: new Map(),
    USED: new Map(),
  };

  for (const row of cat.rows) {
    const condition = String(row.condition ?? "USED").toUpperCase();
    const bucket = buckets[condition] ?? buckets.USED!;
    const mfrId = Number(row.manufacturer_id);
    const modelId = Number(row.model_id);
    const caliberId = Number(row.caliber_id);
    if (!mfrId || !modelId) continue;

    let mfr = bucket.get(mfrId);
    if (!mfr) {
      mfr = {
        Manufacturer: String(row.manufacturer ?? ""),
        ManufacturerID: mfrId,
        IsCommonManufacturer: Boolean(row.is_common),
        Models: [],
      };
      bucket.set(mfrId, mfr);
    }
    let model = (mfr.Models ?? []).find((x) => Number(x.ModelID) === modelId);
    if (!model) {
      model = { Model: String(row.model ?? ""), ModelID: modelId, Calibers: [] };
      mfr.Models = [...(mfr.Models ?? []), model];
    }
    if (caliberId > 0) {
      const exists = (model.Calibers ?? []).some((c) => Number(c.CaliberID) === caliberId);
      if (!exists) {
        model.Calibers = [
          ...(model.Calibers ?? []),
          { Caliber: String(row.caliber ?? ""), CaliberID: caliberId },
        ];
      }
    }
  }

  const deps: OaDependencies = {
    NEW: [...(buckets.NEW?.values() ?? [])],
    USED: [...(buckets.USED?.values() ?? [])],
  };

  const statsByKey = new Map<string, DbStat>();
  const statsByIds = new Map<string, DbStat>();
  for (const row of stats.rows) {
    const s: DbStat = {
      condition: String(row.condition),
      manufacturer: String(row.manufacturer),
      model: String(row.model),
      caliber: String(row.caliber),
      modelId: Number(row.model_id),
      caliberId: Number(row.caliber_id),
      soldCount: Number(row.sold_count ?? 0),
      soldP25: row.sold_p25 == null ? null : Number(row.sold_p25),
      soldMedian: row.sold_median == null ? null : Number(row.sold_median),
      askingCount: Number(row.asking_count ?? 0),
    };
    const key = `${s.condition}|${s.manufacturer}|${s.model}|${s.caliber}`.toLowerCase();
    statsByKey.set(key, s);
    statsByIds.set(`${s.condition}|${s.modelId}|${s.caliberId}`, s);
  }

  return { deps, statsByKey, statsByIds };
}

function resolveLot(deps: OaDependencies, label: string): OaSelection | null {
  const parsed = parseTitleBlob(label);
  if (!parsed.manufacturer || !parsed.model) return null;
  const query = {
    manufacturer: parsed.manufacturer,
    model: parsed.model,
    caliber: parsed.caliber || undefined,
    condition: "used" as const,
  };
  for (const attempt of resolveQueryAttempts(query)) {
    const hit = resolveSelection(deps, attempt);
    if (hit) return hit;
  }
  return null;
}

function pctDelta(a: number | null | undefined, b: number | null | undefined): number | null {
  if (a == null || b == null || !(a > 0) || !(b > 0)) return null;
  return Math.round(((b - a) / a) * 1000) / 10;
}

async function main(): Promise<void> {
  const dbUrl = process.env.OA_DB ?? "file:./data/desk-lightsail-oa.db";
  const resultsPath = resolve("tmp-pearce-lots-10-231-results.json");
  const buyPath = resolve("tmp-pearce-buy-sheet-data.json");

  const prior = JSON.parse(readFileSync(resultsPath, "utf8")) as { results: PearceRow[] };
  const buy = JSON.parse(readFileSync(buyPath, "utf8")) as {
    tallies: Record<string, number>;
    bid: Array<{ lot: string; action?: string; conflict?: string | null }>;
  };

  console.log(`> OA DB: ${dbUrl}`);
  console.log(`> Pearce lots: ${prior.results.length}`);

  const { deps, statsByIds } = await loadDepsFromCatalog(dbUrl);
  console.log(
    `> deps NEW mfrs=${deps.NEW?.length ?? 0} USED mfrs=${deps.USED?.length ?? 0} | stats leaves=${statsByIds.size}`,
  );

  type Cmp = {
    lot: string;
    title: string;
    sheetSold: number;
    sheetP25: number | null;
    sheetMed: number | null;
    sheetMaxBid: number | null;
    sheetNote: string;
    dbMatch: string | null;
    dbScore: number | null;
    dbSold: number | null;
    dbP25: number | null;
    dbMed: number | null;
    dbMaxBid: number | null;
    p25DeltaPct: number | null;
    soldDelta: number | null;
    status:
      | "MATCH_CLOSE"
      | "MATCH_DRIFT"
      | "SHEET_HAD_COMPS_DB_MISS"
      | "SHEET_NO_COMPS_DB_HAS"
      | "BOTH_NO_COMPS"
      | "RESOLVE_FAIL";
    tip: string;
  };

  const rows: Cmp[] = [];

  for (const r of prior.results) {
    const note = parseMatchNote(r.matchNote);
    const sheetSold = Number(r.soldCount ?? note?.sold ?? 0) || 0;
    const sheetP25 = r.soldP25 != null ? Number(r.soldP25) : null;
    const sheetMed = r.soldMedian != null ? Number(r.soldMedian) : null;

    const sel = resolveLot(deps, r.label);
    let db: DbStat | null = null;
    if (sel) {
      db =
        statsByIds.get(`${sel.conditionKey}|${sel.modelId}|${sel.caliberId}`) ??
        statsByIds.get(`USED|${sel.modelId}|${sel.caliberId}`) ??
        null;
    }

    const dbP25 = db?.soldP25 ?? null;
    const dbMed = db?.soldMedian ?? null;
    const dbSold = db?.soldCount ?? null;
    const dbMaxBid = dbP25 != null ? maxBidFromP25(dbP25) : null;
    const p25DeltaPct = pctDelta(sheetP25, dbP25);
    const soldDelta = sheetSold > 0 && dbSold != null ? dbSold - sheetSold : null;

    let status: Cmp["status"];
    let tip: string;

    if (!sel) {
      status = sheetSold > 0 ? "SHEET_HAD_COMPS_DB_MISS" : "RESOLVE_FAIL";
      tip =
        sheetSold > 0
          ? "Live sheet matched OA before; local resolver failed against synced catalog — parser/alias issue"
          : "Title parse/resolve failed and sheet had no comps";
    } else if (sheetSold > 0 && (dbSold == null || dbSold === 0)) {
      status = "SHEET_HAD_COMPS_DB_MISS";
      tip = "Sheet had solds but DB leaf has 0 — wrong leaf match or sync gap";
    } else if (sheetSold === 0 && dbSold != null && dbSold > 0) {
      status = "SHEET_NO_COMPS_DB_HAS";
      tip = "Was RESEARCH/no-comps on sheet; synced DB has solds — rescue candidate";
    } else if (sheetSold === 0 && (!db || dbSold === 0)) {
      status = "BOTH_NO_COMPS";
      tip = "Still no comps in DB after full sync — true OA orphan or bad identity";
    } else if (p25DeltaPct != null && Math.abs(p25DeltaPct) >= 15) {
      status = "MATCH_DRIFT";
      tip = `P25 drifted ${p25DeltaPct}% (sheet vs DB) — check caliber/variant mismatch or market move`;
    } else {
      status = "MATCH_CLOSE";
      tip = "Sheet and DB roughly agree";
    }

    rows.push({
      lot: String(r.lot),
      title: r.label,
      sheetSold,
      sheetP25,
      sheetMed,
      sheetMaxBid: r.maxBid != null ? Number(r.maxBid) : null,
      sheetNote: r.matchNote || "",
      dbMatch: sel
        ? `${sel.manufacturer} ${sel.model} ${sel.caliber} (${sel.conditionKey}, score ${sel.score.toFixed(0)})`
        : null,
      dbScore: sel?.score ?? null,
      dbSold,
      dbP25,
      dbMed,
      dbMaxBid,
      p25DeltaPct,
      soldDelta,
      status,
      tip,
    });
  }

  const tallies: Record<string, number> = {};
  for (const r of rows) tallies[r.status] = (tallies[r.status] ?? 0) + 1;

  const drift = rows
    .filter((r) => r.status === "MATCH_DRIFT")
    .sort((a, b) => Math.abs(b.p25DeltaPct ?? 0) - Math.abs(a.p25DeltaPct ?? 0));
  const rescue = rows.filter((r) => r.status === "SHEET_NO_COMPS_DB_HAS");
  const miss = rows.filter((r) => r.status === "SHEET_HAD_COMPS_DB_MISS" || r.status === "RESOLVE_FAIL");
  const orphans = rows.filter((r) => r.status === "BOTH_NO_COMPS");

  const outJson = {
    generatedAt: new Date().toISOString(),
    dbUrl,
    pearceLots: prior.results.length,
    buySheetTallies: buy.tallies,
    comparisonTallies: tallies,
    rows,
    topDrift: drift.slice(0, 25),
    rescueCandidates: rescue.slice(0, 40),
    resolveProblems: miss.slice(0, 40),
    stillOrphans: orphans.slice(0, 40),
  };

  writeFileSync("tmp-pearce-oa-db-compare.json", JSON.stringify(outJson, null, 2));

  const md: string[] = [];
  md.push("# Pearce buy sheet vs synced OA DB");
  md.push("");
  md.push(`Generated: ${outJson.generatedAt}`);
  md.push(`DB: \`${dbUrl}\``);
  md.push("");
  md.push("## Tallies");
  md.push("");
  for (const [k, v] of Object.entries(tallies).sort((a, b) => b[1] - a[1])) {
    md.push(`- **${k}**: ${v}`);
  }
  md.push("");
  md.push("## What to troubleshoot");
  md.push("");
  md.push(
    `| Bucket | Count | Meaning |`,
  );
  md.push(`|---|---:|---|`);
  md.push(
    `| MATCH_CLOSE | ${tallies.MATCH_CLOSE ?? 0} | Live sheet ≈ DB — good |`,
  );
  md.push(
    `| MATCH_DRIFT | ${tallies.MATCH_DRIFT ?? 0} | Same-ish match but P25 ≥15% off — verify variant/caliber |`,
  );
  md.push(
    `| SHEET_NO_COMPS_DB_HAS | ${tallies.SHEET_NO_COMPS_DB_HAS ?? 0} | Was RESEARCH; DB now has solds — re-price |`,
  );
  md.push(
    `| SHEET_HAD_COMPS_DB_MISS / RESOLVE_FAIL | ${(tallies.SHEET_HAD_COMPS_DB_MISS ?? 0) + (tallies.RESOLVE_FAIL ?? 0)} | Parser/alias can't hit DB leaf (or wrong leaf) |`,
  );
  md.push(
    `| BOTH_NO_COMPS | ${tallies.BOTH_NO_COMPS ?? 0} | Still no comps after full sync — OA gap or ID fail |`,
  );
  md.push("");

  md.push("## Top P25 drift (sheet → DB)");
  md.push("");
  md.push("| Lot | ΔP25% | Sheet P25 | DB P25 | Sheet sold | DB sold | DB match |");
  md.push("|---|---:|---:|---:|---:|---:|---|");
  for (const r of drift.slice(0, 15)) {
    md.push(
      `| ${r.lot} | ${r.p25DeltaPct}% | ${r.sheetP25} | ${r.dbP25} | ${r.sheetSold} | ${r.dbSold} | ${r.dbMatch ?? "—"} |`,
    );
  }
  md.push("");

  md.push("## Rescue candidates (sheet no comps → DB has solds)");
  md.push("");
  md.push("| Lot | DB sold | DB P25 | DB maxBid* | Match | Title |");
  md.push("|---|---:|---:|---:|---|---|");
  for (const r of rescue.slice(0, 20)) {
    md.push(
      `| ${r.lot} | ${r.dbSold} | ${r.dbP25} | ${r.dbMaxBid} | ${r.dbMatch} | ${r.title.slice(0, 60)} |`,
    );
  }
  md.push("");
  md.push("\\* DB maxBid = Desk math on DB P25 with Pearce 18.45% all-in + $50 target.");
  md.push("");

  md.push("## Resolve / miss problems (sample)");
  md.push("");
  for (const r of miss.slice(0, 15)) {
    md.push(`- **Lot ${r.lot}**: ${r.tip}`);
    md.push(`  - Title: ${r.title.slice(0, 90)}`);
    md.push(`  - Sheet: sold=${r.sheetSold} p25=${r.sheetP25} · ${r.sheetNote.slice(0, 100)}`);
    md.push(`  - DB: ${r.dbMatch ?? "no resolve"}`);
  }
  md.push("");

  md.push("## Still orphans (both no comps) — sample");
  md.push("");
  for (const r of orphans.slice(0, 15)) {
    md.push(`- Lot ${r.lot}: ${r.title.slice(0, 90)}`);
  }
  md.push("");
  md.push("Full JSON: `tmp-pearce-oa-db-compare.json`");

  writeFileSync("tmp-pearce-oa-db-compare.md", md.join("\n"));
  console.log(md.join("\n"));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
