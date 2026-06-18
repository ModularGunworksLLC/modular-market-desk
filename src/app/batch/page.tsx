"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";

import { DEAL_DEFAULTS } from "@/lib/arbitrage/constants";
import { parseBatchSheet, type BatchRow } from "@/lib/batch/parse";
import type { BatchResultRow, BatchStreamEvent } from "@/lib/batch/types";

const usd = (n: number | null | undefined) =>
  n == null || !Number.isFinite(n) ? "—" : n.toLocaleString("en-US", { style: "currency", currency: "USD" });

type SortKey = "lot" | "headroom" | "netProfit" | "maxBid" | "soldCount";

const SAMPLE = `Lot,Title,Current Bid,Buyer Premium
101,Glock 19 Gen5 9mm,420,18
102,Smith & Wesson M&P Shield 9mm,210,18
103,Ruger 10/22 .22 LR,180,18
104,Sig Sauer P320 Compact 9mm,365,18`;

export default function BatchPage() {
  const [text, setText] = useState("");
  const [defaults, setDefaults] = useState({
    targetProfit: String(DEAL_DEFAULTS.targetProfit),
    buyerPremiumPct: String(DEAL_DEFAULTS.buyerPremiumPct),
    outboundShip: "",
    inboundShip: "0",
    listingUpgrades: String(DEAL_DEFAULTS.listingUpgrades),
    condition: "any" as "new" | "used" | "any",
    buyerPaysOutboundShip: true,
    buyerPaysCardFee: true,
  });
  const [results, setResults] = useState<Map<number, BatchResultRow>>(new Map());
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [onlyGo, setOnlyGo] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("headroom");
  const [fileStatus, setFileStatus] = useState<{
    kind: "idle" | "loading" | "ok" | "error";
    message: string;
    fileName?: string;
  }>({ kind: "idle", message: "" });
  const fileRef = useRef<HTMLInputElement>(null);

  const parsed = useMemo(() => {
    if (!text.trim()) return null;
    return parseBatchSheet(text, {
      defaultBuyerPremiumPct: Number(defaults.buyerPremiumPct) || undefined,
    });
  }, [text, defaults.buyerPremiumPct]);

  const evaluable = useMemo(
    () => (parsed?.rows ?? []).filter((r) => !r.unresolved),
    [parsed],
  );

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    const name = file.name.toLowerCase();
    if (name.endsWith(".xlsx") || name.endsWith(".xls") || name.endsWith(".xlsm")) {
      setFileStatus({
        kind: "error",
        message:
          "Excel (.xlsx) cannot be read here. In Excel use File → Save As → CSV (Comma delimited) (*.csv), then upload that file — or copy the sheet and paste into the box below.",
        fileName: file.name,
      });
      return;
    }

    setFileStatus({ kind: "loading", message: `Reading ${file.name}…`, fileName: file.name });
    setError(null);
    try {
      const raw = await file.text();
      if (raw.length < 2) {
        setFileStatus({ kind: "error", message: "File is empty.", fileName: file.name });
        return;
      }
      // XLSX is a ZIP archive — first bytes are PK even if extension is wrong.
      if (raw.charCodeAt(0) === 0x50 && raw.charCodeAt(1) === 0x4b) {
        setFileStatus({
          kind: "error",
          message:
            "This looks like an Excel workbook, not plain CSV. Save As CSV from Excel, then upload again.",
          fileName: file.name,
        });
        return;
      }
      setText(raw);
      setFileStatus({
        kind: "ok",
        message: `Loaded ${file.name} (${(raw.length / 1024).toFixed(1)} KB). Check the preview below the box.`,
        fileName: file.name,
      });
    } catch (err) {
      setFileStatus({
        kind: "error",
        message: err instanceof Error ? err.message : "Could not read file.",
        fileName: file.name,
      });
    }
  }

  async function run() {
    if (!parsed || evaluable.length === 0) return;
    setRunning(true);
    setError(null);
    setResults(new Map());
    setProgress({ done: 0, total: evaluable.length });

    try {
      const res = await fetch("/api/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rows: evaluable.map((r: BatchRow) => ({
            rowNumber: r.rowNumber,
            lot: r.lot,
            manufacturer: r.manufacturer,
            model: r.model,
            caliber: r.caliber,
            category: r.category,
            upc: r.upc,
            currentBid: r.currentBid,
            buyerPremiumPct: r.buyerPremiumPct,
          })),
          defaults: {
            condition: defaults.condition,
            buyerPremiumPct: Number(defaults.buyerPremiumPct) || 0,
            inboundShip: Number(defaults.inboundShip) || 0,
            outboundShip:
              defaults.outboundShip.trim() === ""
                ? undefined
                : Number(defaults.outboundShip) || 0,
            listingUpgrades: Number(defaults.listingUpgrades) || 0,
            buyerPaysOutboundShip: defaults.buyerPaysOutboundShip,
            buyerPaysCardFee: defaults.buyerPaysCardFee,
            targetProfit: Number(defaults.targetProfit) || 0,
          },
        }),
      });

      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => null);
        throw new Error(j?.error ? JSON.stringify(j.error) : `Request failed (${res.status})`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const evt = JSON.parse(line) as BatchStreamEvent;
          if (evt.type === "meta") {
            setProgress({ done: 0, total: evt.total });
          } else if (evt.type === "result") {
            setResults((prev) => {
              const m = new Map(prev);
              m.set(evt.row.rowNumber, evt.row);
              return m;
            });
            setProgress({ done: evt.completed, total: evaluable.length });
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  }

  const rows = useMemo(() => {
    let list = Array.from(results.values());
    if (onlyGo) list = list.filter((r) => r.verdict === "GO");
    list.sort((a, b) => {
      const av = sortValue(a, sortKey);
      const bv = sortValue(b, sortKey);
      if (sortKey === "lot") return String(a.lot).localeCompare(String(b.lot), undefined, { numeric: true });
      return bv - av;
    });
    return list;
  }, [results, onlyGo, sortKey]);

  const summary = useMemo(() => {
    const all = Array.from(results.values());
    const go = all.filter((r) => r.verdict === "GO");
    const totalHeadroom = go.reduce((s, r) => s + (r.headroom ?? 0), 0);
    const noComps = all.filter((r) => r.soldCount === 0).length;
    return { evaluated: all.length, go: go.length, totalHeadroom, noComps };
  }, [results]);

  const setD = (k: keyof typeof defaults) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setDefaults((d) => ({ ...d, [k]: e.target.value }));

  return (
    <main className="mx-auto max-w-[1800px] px-4 py-6">
      <header className="mb-6 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Batch Buy-Sheet</h1>
          <p className="text-xs text-desk-muted">
            Paste or upload an auction manifest — get Max Bid, GO/NO-GO, and dealer floor on every lot.
          </p>
        </div>
        <nav className="flex items-baseline gap-4 text-xs">
          <Link href="/" className="text-desk-accent hover:underline">
            Single deal
          </Link>
          <Link href="/import" className="text-desk-accent hover:underline">
            Ingestion
          </Link>
        </nav>
      </header>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[400px_minmax(0,1fr)]">
        <section className="panel space-y-3 lg:sticky lg:top-4 lg:self-start">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-desk-muted">Auction sheet</h2>
            <div className="flex gap-2 text-xs">
              <button
                type="button"
                onClick={() => {
                  setText(SAMPLE);
                  setFileStatus({ kind: "ok", message: "Loaded sample (4 lots).", fileName: "sample" });
                  setError(null);
                }}
                className="text-desk-accent hover:underline"
              >
                Load sample
              </button>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="text-desk-accent hover:underline"
              >
                Upload CSV
              </button>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain"
                onChange={onFile}
                className="hidden"
              />
            </div>
          </div>

          {fileStatus.kind !== "idle" && (
            <div
              className={`rounded-md border px-3 py-2 text-xs ${
                fileStatus.kind === "error"
                  ? "border-desk-nogo/50 bg-desk-nogo/10 text-desk-nogo"
                  : fileStatus.kind === "loading"
                    ? "border-desk-border bg-desk-panel2 text-desk-muted"
                    : "border-desk-go/40 bg-desk-go/10 text-desk-go"
              }`}
            >
              {fileStatus.message}
            </div>
          )}

          <p className="text-[11px] text-desk-muted">
            <strong className="text-desk-text">CSV or paste only</strong> — not .xlsx. From Excel: Save As →{" "}
            <em>CSV (Comma delimited)</em>. Your sheet needs a header row with something like{" "}
            <strong className="text-desk-text">Item Description</strong> / <strong className="text-desk-text">Title</strong>, or a{" "}
            <strong className="text-desk-text">Model</strong> column with the full gun line (e.g. &quot;Glock 19 Gen5 9mm&quot;).
          </p>

          <textarea
            className="field-input h-44 w-full font-mono text-xs"
            placeholder="Paste CSV with a header row. Needs Item Description / Title (or Make + Model). Optional: Lot, Category, Current Bid, Buyer Premium."
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              if (fileStatus.kind === "ok") setFileStatus({ kind: "idle", message: "" });
            }}
          />

          {text.trim() && !parsed && (
            <p className="text-xs text-desk-nogo">Could not parse — add a header row and at least one data row.</p>
          )}

          {parsed && (
            <div className="rounded-md border border-desk-border bg-desk-panel2 px-3 py-2 text-xs">
              <p>
                <span className="font-semibold text-desk-text">{evaluable.length}</span> evaluable lot(s)
                {parsed.rows.length !== evaluable.length && (
                  <span className="text-desk-muted"> · {parsed.rows.length - evaluable.length} skipped</span>
                )}
              </p>
              {Object.keys(parsed.mapping).length > 0 && (
                <p className="mt-1 text-desk-muted">
                  Mapped: {Object.entries(parsed.mapping).map(([h, f]) => `${h}→${f}`).join(", ")}
                </p>
              )}
              {parsed.warnings.map((w, i) => (
                <p key={i} className="mt-1 text-desk-nogo">
                  {w}
                </p>
              ))}
              {evaluable.length === 0 && parsed.rows.length > 0 && (
                <p className="mt-2 font-semibold text-desk-nogo">
                  No lots could be matched to a make/model — fix titles or add Make/Model columns, then try again.
                </p>
              )}
              {parsed.rows.length === 0 && (
                <p className="mt-2 font-semibold text-desk-nogo">
                  Zero data rows — check that the first line is headers and the file is CSV (not Excel).
                </p>
              )}
            </div>
          )}

          <h2 className="pt-1 text-sm font-semibold text-desk-muted">Defaults applied to every lot</h2>
          <div className="grid grid-cols-2 gap-3">
            <NumField label="Target profit ($)" v={defaults.targetProfit} on={setD("targetProfit")} />
            <NumField label="Buyer premium %" v={defaults.buyerPremiumPct} on={setD("buyerPremiumPct")} />
            <NumField label="Inbound ship ($)" v={defaults.inboundShip} on={setD("inboundShip")} />
            <NumField
              label="Outbound ship ($)"
              v={defaults.outboundShip}
              on={setD("outboundShip")}
              placeholder="Auto: 45 pistol / 60 rifle"
            />
            <NumField label="Listing upgrades ($)" v={defaults.listingUpgrades} on={setD("listingUpgrades")} />
            <div>
              <label className="field-label">Condition (comps)</label>
              <select
                className="field-input"
                value={defaults.condition}
                onChange={(e) =>
                  setDefaults((d) => ({ ...d, condition: e.target.value as typeof d.condition }))
                }
              >
                <option value="new">New</option>
                <option value="used">Used</option>
                <option value="any">Any</option>
              </select>
            </div>
          </div>
          <p className="text-[11px] text-desk-muted">
            Per-row Buyer Premium / Current Bid from the CSV override these. Buyer pays ship + card by default.
          </p>

          <button
            type="button"
            onClick={run}
            disabled={running || evaluable.length === 0}
            className="w-full rounded-md bg-desk-accent px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            {running ? "Pulling live comps…" : `Run buy-sheet (${evaluable.length})`}
          </button>
          {evaluable.length === 0 && text.trim() && !running && (
            <p className="text-center text-[11px] text-desk-nogo">
              Run is disabled until at least one lot parses with a known make + model.
            </p>
          )}
          {progress && (
            <div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-desk-panel2">
                <div
                  className="h-full bg-desk-accent transition-all"
                  style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }}
                />
              </div>
              <p className="mt-1 text-center text-[11px] text-desk-muted">
                {progress.done} / {progress.total} lots evaluated
                {running && " — live comps can take a few seconds per lot"}
              </p>
            </div>
          )}
          {error && <p className="text-sm text-desk-nogo">{error}</p>}
        </section>

        <section className="space-y-4">
          {results.size === 0 && !running && (
            <div className="panel py-12 text-center text-sm text-desk-muted">
              Paste an auction sheet on the left and run it. Results stream in lot-by-lot, ranked by headroom.
            </div>
          )}

          {results.size > 0 && (
            <>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <SummaryStat label="Lots evaluated" value={String(summary.evaluated)} />
                <SummaryStat label="GO lots" value={String(summary.go)} tone="go" />
                <SummaryStat label="Total headroom (GO)" value={usd(summary.totalHeadroom)} tone="go" />
                <SummaryStat label="No comps found" value={String(summary.noComps)} tone={summary.noComps ? "nogo" : undefined} />
              </div>

              <div className="panel overflow-x-auto">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-desk-muted">Ranked buy-sheet</h3>
                  <div className="flex items-center gap-3 text-xs">
                    <label className="flex cursor-pointer items-center gap-1.5">
                      <input
                        type="checkbox"
                        className="h-3.5 w-3.5 accent-desk-accent"
                        checked={onlyGo}
                        onChange={(e) => setOnlyGo(e.target.checked)}
                      />
                      GO only
                    </label>
                    <label className="flex items-center gap-1.5">
                      Sort
                      <select
                        className="field-input !w-auto !py-1 text-xs"
                        value={sortKey}
                        onChange={(e) => setSortKey(e.target.value as SortKey)}
                      >
                        <option value="headroom">Headroom</option>
                        <option value="netProfit">Profit @P25</option>
                        <option value="maxBid">Max bid</option>
                        <option value="soldCount">Comp count</option>
                        <option value="lot">Lot</option>
                      </select>
                    </label>
                  </div>
                </div>
                <table className="w-full min-w-[920px] text-sm">
                  <thead className="text-left text-xs uppercase text-desk-muted">
                    <tr>
                      <th className="py-1">Lot</th>
                      <th>Item</th>
                      <th>Verdict</th>
                      <th className="text-right">Current bid</th>
                      <th className="text-right">Max bid</th>
                      <th className="text-right">Walk-away</th>
                      <th className="text-right">Headroom</th>
                      <th className="text-right">Profit @P25</th>
                      <th className="text-right">Dealer floor</th>
                      <th className="text-right">Comps</th>
                    </tr>
                  </thead>
                  <tbody className="num">
                    {rows.map((r) => (
                      <tr
                        key={r.rowNumber}
                        className={`border-t border-desk-border ${
                          r.verdict === "GO" ? "bg-desk-go/5" : ""
                        }`}
                      >
                        <td className="py-1.5 font-sans">{r.lot}</td>
                        <td className="max-w-[280px] font-sans">
                          <div className="truncate" title={r.label}>
                            {r.label}
                            {r.bestDealer && (
                              <span className="ml-1 text-[10px] capitalize text-desk-muted">· {r.bestDealer}</span>
                            )}
                          </div>
                          <div
                            className="truncate text-[10px] text-desk-muted"
                            title={r.error ?? r.matchNote}
                          >
                            {r.error ? `error: ${r.error}` : r.matchNote || "—"}
                          </div>
                        </td>
                        <td>
                          {r.error ? (
                            <span className="text-[11px] text-desk-nogo" title={r.error}>
                              error
                            </span>
                          ) : r.verdict == null ? (
                            <span className="text-[11px] text-desk-muted">no comps</span>
                          ) : (
                            <span
                              className={`font-sans font-bold ${
                                r.verdict === "GO" ? "text-desk-go" : "text-desk-nogo"
                              }`}
                            >
                              {r.verdict}
                            </span>
                          )}
                        </td>
                        <td className="text-right">{usd(r.currentBid)}</td>
                        <td className="text-right font-semibold">{usd(r.maxBid)}</td>
                        <td className="text-right font-semibold">{usd(r.walkAway)}</td>
                        <td
                          className={`text-right font-semibold ${
                            r.headroom == null ? "text-desk-muted" : r.headroom >= 0 ? "text-desk-go" : "text-desk-nogo"
                          }`}
                        >
                          {r.headroom == null ? "—" : `${r.headroom >= 0 ? "+" : ""}${usd(r.headroom)}`}
                        </td>
                        <td className={`text-right ${r.netProfit != null && r.netProfit >= 0 ? "text-desk-go" : "text-desk-nogo"}`}>
                          {usd(r.netProfit)}
                        </td>
                        <td className="text-right">{usd(r.dealerFloor)}</td>
                        <td className="text-right text-desk-muted">{r.soldCount || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="mt-3 text-[11px] text-desk-muted">
                  <strong className="text-desk-text">Walk-away</strong> = the lower of the profit-based Max Bid and
                  the new in-stock dealer floor — never bid above it. Headroom = walk-away − current bid.
                </p>
              </div>
            </>
          )}
        </section>
      </div>
    </main>
  );
}

function sortValue(r: BatchResultRow, key: SortKey): number {
  switch (key) {
    case "headroom":
      return r.headroom ?? -Infinity;
    case "netProfit":
      return r.netProfit ?? -Infinity;
    case "maxBid":
      return r.maxBid ?? -Infinity;
    case "soldCount":
      return r.soldCount;
    default:
      return 0;
  }
}

function NumField(props: {
  label: string;
  v: string;
  on: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="field-label">{props.label}</label>
      <input
        className="field-input"
        value={props.v}
        onChange={props.on}
        inputMode="decimal"
        placeholder={props.placeholder}
      />
    </div>
  );
}

function SummaryStat(props: { label: string; value: string; tone?: "go" | "nogo" }) {
  return (
    <div className="panel py-3">
      <div className="field-label">{props.label}</div>
      <div
        className={`num text-lg font-bold ${
          props.tone === "go" ? "text-desk-go" : props.tone === "nogo" ? "text-desk-nogo" : "text-desk-text"
        }`}
      >
        {props.value}
      </div>
    </div>
  );
}
