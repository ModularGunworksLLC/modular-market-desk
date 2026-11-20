/**
 * Dry run of the trust-and-accuracy parser and scorer against the Nov 15/17
 * valuation export. Raw auction sheets were not stored, so the title is the
 * stored manufacturer + model + caliber. Highlight rows are also parsed from
 * the titles Michael named.
 *
 * Usage: npx tsx scripts/dry-run-2026-11-19.ts [valuations.json] [out.md]
 */

import { readFileSync, writeFileSync } from "node:fs";

import { parseBatchSheet, parseTitleBlob } from "../src/lib/batch/parse";
import { resolveBestAttempt, resolveQueryAttempts, type OaDependencies } from "../src/lib/gba/scorer";

type Row = {
  id: string;
  created_at: number;
  category: string;
  manufacturer: string;
  model: string;
  caliber: string | null;
  max_bid: number | null;
  verdict: string | null;
  target_acquisition_cost: number;
  source_status: string;
  sold_stats: string | null;
};

const valuationsPath =
  process.argv[2] ??
  "/home/ubuntu/.cursor/projects/agent-repos-modular-market-desk/uploads/valuations-recent_1ee8.json";
const outPath = process.argv[3] ?? "docs/dry-run-2026-11-19.md";

const rows = JSON.parse(readFileSync(valuationsPath, "utf8")) as Row[];

function day(ts: number): string {
  const ms = ts > 10_000_000_000 ? ts : ts * 1000;
  return new Date(ms).toISOString().slice(0, 10);
}

function oldMatch(raw: string): string {
  try {
    const parsed = JSON.parse(raw) as { gba?: string };
    return parsed.gba ?? raw;
  } catch {
    return raw;
  }
}

function leafFromStatus(text: string): { manufacturer: string; model: string; caliber: string; n: number } | null {
  const m = text.match(/local cache:\s+(.+?)\s+\((?:USED|NEW)\)\s+—\s+(\d+)\s+sold/i);
  if (!m?.[1]) return null;
  const parts = m[1].trim().split(/\s+/);
  const manufacturer = parts[0] ?? "";
  const n = Number(m[2] ?? 0);
  const caliber = parts.length > 2 ? parts.slice(-2).join(" ") : "";
  const model = parts.slice(1, caliber ? -2 : undefined).join(" ") || parts.slice(1).join(" ");
  return { manufacturer, model: model || parts.slice(1).join(" "), caliber, n };
}

const EXTRA_LEAVES = [
  { manufacturer: "BROWNING", model: "1911-22", caliber: ".22 LR", n: 51 },
  { manufacturer: "BROWNING", model: "1911", caliber: ".22 LR", n: 11 },
  { manufacturer: "HENRY", model: "BIG BOY", caliber: ".44 MAG.", n: 31 },
  { manufacturer: "IZHMASH", model: "SAIGA-12", caliber: "12 GAUGE", n: 66 },
  { manufacturer: "SAIGA", model: "SAIGA 12", caliber: "12 GAUGE", n: 39 },
];

function buildDeps(leaves: { manufacturer: string; model: string; caliber: string; n: number }[]): OaDependencies {
  const byMfr = new Map<string, { Manufacturer: string; ManufacturerID: number; IsCommonManufacturer: boolean; Models: { Model: string; ModelID: number; Calibers: { Caliber: string; CaliberID: number; SoldCount: number }[] }[] }>();
  let id = 1;
  for (const leaf of leaves) {
    const key = leaf.manufacturer.toUpperCase();
    let node = byMfr.get(key);
    if (!node) {
      node = { Manufacturer: leaf.manufacturer, ManufacturerID: id++, IsCommonManufacturer: true, Models: [] };
      byMfr.set(key, node);
    }
    node.Models.push({
      Model: leaf.model,
      ModelID: id++,
      Calibers: [{ Caliber: leaf.caliber, CaliberID: id++, SoldCount: leaf.n }],
    });
  }
  return { USED: [...byMfr.values()] };
}

const knownLeaves = new Map<string, { manufacturer: string; model: string; caliber: string; n: number }>();
for (const leaf of EXTRA_LEAVES) knownLeaves.set(`${leaf.manufacturer}|${leaf.model}|${leaf.caliber}`.toUpperCase(), leaf);
for (const row of rows) {
  const leaf = leafFromStatus(oldMatch(row.source_status));
  if (!leaf) continue;
  const key = `${leaf.manufacturer}|${leaf.model}|${leaf.caliber}`.toUpperCase();
  if (!knownLeaves.has(key)) knownLeaves.set(key, leaf);
}
const deps = buildDeps([...knownLeaves.values()]);

function esc(s: string): string {
  return s.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

const lines: string[] = [];
lines.push("# Dry run 2026-11-19");
lines.push("");
lines.push("Input is `valuations-recent.json` (928 stored rows: 94 on 2026-11-16 UTC / Nov 15 CT, 834 on 2026-11-18 UTC / Nov 17 CT). Raw auction sheets were not saved, so the title used for the new parser is `manufacturer + model + caliber` from the valuation. That understates titles that only existed on the sheet (for example a leading \"Izmash / Russia\"). Those are parsed separately below.");
lines.push("");
lines.push("OA re-score uses the leaf named in each row's stored `source_status`, plus the leaves phase 1 confirmed exist: BROWNING 1911-22 .22 LR (n=51), HENRY BIG BOY .44 MAG (n=31), IZHMASH SAIGA-12 (n=66), SAIGA SAIGA 12 (n=39). It is not a re-query of the full 6,878-leaf cache. Max hammer is the stored value unless the new rules suppress it (score under 70, no used comps, or no OA match). Sold prices were not recomputed.");
lines.push("");

const highlights = (blob: string) =>
  /lar|ww-?15|94ae|94 ae|\b700\b|1911|buck|henry|saiga|h012x/i.test(blob);

let catChanges = 0;
let suppressed = 0;
let matchChanges = 0;
const table: string[] = [];
table.push("| When | Old category | New category | Old OA | New OA | Score | n | Old max | New max | Status |");
table.push("|---|---|---|---|---|---:|---:|---:|---|---|");

for (const row of rows) {
  const surrogate = `${row.manufacturer} ${row.model ?? ""} ${row.caliber ?? ""}`.trim();
  const parsed = parseTitleBlob(surrogate);
  const oldGba = oldMatch(row.source_status);
    const query = {
      manufacturer: parsed.manufacturer || row.manufacturer,
      model: parsed.model || row.model,
      caliber: parsed.caliber || row.caliber || undefined,
      condition: "used" as const,
    };
    const hit = resolveBestAttempt(deps, resolveQueryAttempts(query));
  const low = hit != null && hit.score < 70;
  const suppress = !hit || low || (hit.soldCount ?? 0) <= 0;
  if (parsed.category !== row.category) catChanges += 1;
  if (suppress && (row.max_bid ?? 0) > 0) suppressed += 1;
  const newLeaf = hit ? `${hit.manufacturer} ${hit.model} ${hit.caliber}` : "no match";
  if (hit && !oldGba.toUpperCase().includes(hit.model.toUpperCase())) matchChanges += 1;
  const status = [
    parsed.category !== row.category ? "category" : "",
    low ? "low confidence" : "",
    suppress ? "max suppressed" : "max kept",
    parsed.partsWarning ? "parts" : "",
  ]
    .filter(Boolean)
    .join(", ");
  const mark = highlights(surrogate) ? "HIGHLIGHT " : "";
  table.push(
    `| ${mark}${day(row.created_at)} ${esc(surrogate)} | ${row.category} | ${parsed.category} | ${esc(oldGba.slice(0, 80))} | ${esc(newLeaf)} | ${hit ? hit.score.toFixed(0) : ""} | ${hit?.soldCount ?? ""} | ${row.max_bid ?? ""} | ${suppress ? "suppressed" : (row.max_bid ?? "")} | ${esc(status)} |`,
  );
}

lines.push(`Rows: ${rows.length}. Category changes on the surrogate title: ${catChanges}. Stored max hammers that the new gate would suppress: ${suppressed}. Rows whose new leaf name is not in the old match text: ${matchChanges}.`);
lines.push("");
lines.push("Every stored row is listed. Rows whose surrogate title matches LAR-15, WW-15, 94AE, 700, 1911, Buck Mark, Henry, or Saiga are prefixed HIGHLIGHT.");
lines.push("");
lines.push(...table);
lines.push("");
lines.push("## Parser before / after");
lines.push("");
lines.push("Before is the live snapshot behavior (brand suffixes left in the model, `w/` deleted, no Current Bid warning, newline split before quotes). After is this branch.");
lines.push("");

const examples: { title: string; before: string }[] = [
  {
    title: "Henry Repeating Arms H012X",
    before: "maker Henry, model `Repeating Arms H012X` (suffix leaked). OA never reached BIG BOY.",
  },
  {
    title: "Izmash / Russia SAIGA-12",
    before: "maker/model kept Izmash, Russia, and the slash, or the lot was skipped as unresolved. No valuation row was ever stored for Saiga.",
  },
  {
    title: "S&W Model 66 .357",
    before: "`S&W` was not the Smith & Wesson lexicon entry, so the maker often stayed the initials.",
  },
  {
    title: "Smith and Wesson Model 66 .357",
    before: "Same family, different spelling, not folded to Smith & Wesson before the model split.",
  },
  {
    title: "Cugir Arms Factory WASR-10",
    before: "`Arms Factory` could remain in the model. Romarm/Cugir was not a maker alias.",
  },
  {
    title: "Romarm/Cugir WASR-10",
    before: "Slash form was not normalized to Cugir.",
  },
  {
    title: "Remington Model 700 .308 w/ extra mag, scope, sporter, parts",
    before: "`w/ ...` was deleted from the model and not stored. `parts` was not a warning.",
  },
  {
    title: "Rock River LAR-15 5.56 pistol grip",
    before: "Category handgun. `LAR-15` missed the AR hint, and `pistol grip` matched handgun first.",
  },
];

lines.push("| Title | Before | After |");
lines.push("|---|---|---|");
for (const example of examples) {
  const parsed = parseTitleBlob(example.title);
  const after = `maker ${parsed.manufacturer}; model ${parsed.model}; ${parsed.caliber || "no caliber"}; ${parsed.category}; accessories [${parsed.accessories.join(", ")}]; flags [${parsed.flags.join(", ")}]${parsed.partsWarning ? "; PARTS WARNING" : ""}`;
  lines.push(`| ${esc(example.title)} | ${esc(example.before)} | ${esc(after)} |`);
}

const empty = parseBatchSheet("Lot,Title,OA sold P25 (comps, not a bid)\n20,LAR-15,409\n23,WW-15,368.75\n");
lines.push("");
lines.push("Empty Current Bid, with P25 in the next column (the Nov 15 misread):");
lines.push("");
lines.push("```");
lines.push(empty.warnings.join("\n") || "(no warning)");
lines.push(`lot 20 current=${empty.rows[0]?.currentBid ?? "null"} category=${empty.rows[0]?.category}`);
lines.push(`lot 23 current=${empty.rows[1]?.currentBid ?? "null"} category=${empty.rows[1]?.category}`);
lines.push("```");
lines.push("");
lines.push("H012X stays the parsed model. The scorer also tries HENRY BIG BOY .44 MAG, which is Henry's published model number H012X (henryusa.com and the 2023 MSRP list). Other H012* SKUs are not rewritten.");
lines.push("");
const henry = parseTitleBlob("Henry Repeating Arms H012X .44 Magnum");
const henryHit = resolveBestAttempt(
  deps,
  resolveQueryAttempts({
    manufacturer: henry.manufacturer,
    model: henry.model,
    caliber: henry.caliber,
    condition: "used",
  }),
);
lines.push(
  `Henry title re-score: maker ${henry.manufacturer}, model ${henry.model} → ${henryHit ? `${henryHit.manufacturer} ${henryHit.model} ${henryHit.caliber} n=${henryHit.soldCount} score ${henryHit.score.toFixed(0)}` : "no match"}.`,
);
const browning = parseTitleBlob("Browning 1911-22 .22 LR");
const browningHit = resolveBestAttempt(
  deps,
  resolveQueryAttempts({
    manufacturer: browning.manufacturer,
    model: browning.model,
    caliber: browning.caliber,
    condition: "used",
  }),
);
lines.push(
  `Browning 1911-22 title re-score: maker ${browning.manufacturer}, model ${browning.model} → ${browningHit ? `${browningHit.manufacturer} ${browningHit.model} ${browningHit.caliber} n=${browningHit.soldCount} score ${browningHit.score.toFixed(0)}` : "no match"}. The stored Nov 15 row only has model "1911", so that row cannot recover the 1911-22 token.`,
);
const saiga = parseTitleBlob("Izmash / Russia SAIGA-12");
const saigaHit = resolveBestAttempt(
  deps,
  resolveQueryAttempts({
    manufacturer: saiga.manufacturer,
    model: saiga.model,
    caliber: saiga.caliber || "12ga",
    condition: "used",
  }),
);
lines.push(
  `Saiga title re-score: maker ${saiga.manufacturer}, model ${saiga.model}, ${saiga.category} → ${saigaHit ? `${saigaHit.manufacturer} ${saigaHit.model} ${saigaHit.caliber} n=${saigaHit.soldCount} score ${saigaHit.score.toFixed(0)}` : "no match"}.`,
);
lines.push("");

writeFileSync(outPath, lines.join("\n"));
console.log(`wrote ${outPath} (${lines.length} lines), category changes ${catChanges}, suppressed ${suppressed}`);
