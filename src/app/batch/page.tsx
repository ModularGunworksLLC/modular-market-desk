"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { CLIENT_DEAL_DEFAULTS } from "@/lib/arbitrage/client-defaults";
import { DEFAULT_BID_INCREMENTS, type BidIncrementBand } from "@/lib/auctions/bid-increments";
import { parseBatchSheet, type BatchRow } from "@/lib/batch/parse";
import type { BatchResultRow, BatchStreamEvent } from "@/lib/batch/types";
import { loadDealerDefaults } from "@/lib/desk-defaults";
import { parseMoneyFieldOrZero, usd } from "@/lib/format";
import type { WebEnrichPhase } from "@/lib/web-comps/types";

type SortKey = "lot" | "headroom" | "netProfit" | "maxBid" | "soldCount";

function webEnrichBadge(phase: WebEnrichPhase | undefined | null): {
  label: string;
  className: string;
  title: string;
} {
  switch (phase) {
    case "oa":
      return { label: "OA", className: "text-desk-go", title: "Using Outdoor Analytics solds" };
    case "web":
      return { label: "Web ✓", className: "text-desk-accent", title: "Web-validated comps applied to Max Bid" };
    case "queued":
      return { label: "Queued…", className: "text-desk-warn", title: "Waiting in Tavily drip queue" };
    case "running":
      return { label: "Enriching…", className: "text-desk-warn", title: "Tavily enrich in progress now" };
    case "ready":
      return {
        label: "Ready",
        className: "text-desk-accent",
        title: "High-conf web comps ready — applying to sheet automatically",
      };
    case "weak":
      return {
        label: "Weak",
        className: "text-desk-muted",
        title: "Enrich finished but confidence too low for Max Bid",
      };
    case "skipped":
      return { label: "Skipped", className: "text-desk-muted", title: "Not queued (daily budget or skipped)" };
    default:
      return { label: "—", className: "text-desk-muted", title: "" };
  }
}

const SAMPLE = `Lot,Title,Current Bid,Buyer Premium
101,Glock 19 Gen5 9mm,420,18
102,Smith & Wesson M&P Shield 9mm,210,18
103,Ruger 10/22 .22 LR,180,18
104,Sig Sauer P320 Compact 9mm,365,18`;

export default function BatchPage() {
  const [text, setText] = useState("");
  const [defaults, setDefaults] = useState({
    targetProfit: String(CLIENT_DEAL_DEFAULTS.targetProfit),
    minMarginPct: String(CLIENT_DEAL_DEFAULTS.minMarginPct),
    buyerPremiumPct: "",
    outboundShip: "",
    inboundShip: "0",
    listingUpgrades: String(CLIENT_DEAL_DEFAULTS.listingUpgrades),
    condition: "any" as "new" | "used" | "any",
    sellChannel: "local" as "gunbroker" | "local",
    salesTaxPct: String(CLIENT_DEAL_DEFAULTS.salesTaxPct),
    buyerPaysOutboundShip: true,
    buyerPaysCardFee: true,
    bidIncrements: DEFAULT_BID_INCREMENTS.map((b) => ({ ...b })),
  });
  const [results, setResults] = useState<Map<number, BatchResultRow>>(new Map());
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [onlyGo, setOnlyGo] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("headroom");
  const [incrementHint, setIncrementHint] = useState<string | null>(null);
  const [fileStatus, setFileStatus] = useState<{
    kind: "idle" | "loading" | "ok" | "error";
    message: string;
    fileName?: string;
  }>({ kind: "idle", message: "" });
  const fileRef = useRef<HTMLInputElement>(null);
  const [auctionUrl, setAuctionUrl] = useState(
    "https://bids.auctionbypearce.com/auctions/47513-july-guns-gear-and-ammo-auction",
  );
  const [auctionBusy, setAuctionBusy] = useState(false);
  const [auctionMsg, setAuctionMsg] = useState<string | null>(null);
  const [webQueueBanner, setWebQueueBanner] = useState<string | null>(null);
  const lastRunRef = useRef<{
    rowsByNumber: Map<
      number,
      {
        rowNumber: number;
        lot: string;
        manufacturer: string;
        model: string;
        caliber: string;
        category: string;
        upc: string;
        lotTitle: string;
        currentBid: number | null;
        requiredBid: number | null;
        bidIncrementAmount: number | null;
        buyerPremiumPct: number | null;
      }
    >;
    defaults: Record<string, unknown>;
  } | null>(null);
  const reevalInFlight = useRef<Set<number>>(new Set());
  const appliedReadyKeys = useRef<Set<string>>(new Set());

  useEffect(() => {
    const d = loadDealerDefaults();
    setDefaults((prev) => ({
      ...prev,
      targetProfit: d.targetProfit || prev.targetProfit,
      minMarginPct: d.minMarginPct || prev.minMarginPct,
      // Do not overwrite sheet BP with global Settings — auction BP is per-event.
      sellChannel: d.sellChannel === "gunbroker" ? "gunbroker" : prev.sellChannel,
      bidIncrements: d.bidIncrements?.length ? d.bidIncrements : prev.bidIncrements,
    }));
    const onDefaults = (e: Event) => {
      const detail = (e as CustomEvent).detail as {
        bidIncrements?: BidIncrementBand[];
        targetProfit?: string;
        minMarginPct?: string;
      } | undefined;
      if (!detail) return;
      setDefaults((prev) => ({
        ...prev,
        ...(detail.bidIncrements?.length ? { bidIncrements: detail.bidIncrements } : {}),
        ...(detail.targetProfit ? { targetProfit: detail.targetProfit } : {}),
        ...(detail.minMarginPct ? { minMarginPct: detail.minMarginPct } : {}),
      }));
    };
    window.addEventListener("desk-defaults-changed", onDefaults);
    return () => window.removeEventListener("desk-defaults-changed", onDefaults);
  }, []);

  // Poll web-enrich status; when Ready, auto re-eval and patch the sheet.
  const pendingEnrichKeys = useMemo(() => {
    const keys = Array.from(results.values())
      .map((r) => r.webEnrich)
      .filter(
        (w): w is NonNullable<BatchResultRow["webEnrich"]> =>
          !!w?.canonicalKey &&
          (w.phase === "queued" || w.phase === "running" || w.phase === "ready"),
      )
      .map((w) => w.canonicalKey!);
    return [...new Set(keys)].sort();
  }, [results]);

  const pendingEnrichKey = pendingEnrichKeys.join("|");

  useEffect(() => {
    // Also poll when we have Ready rows awaiting apply (in case apply failed once).
    const watchKeys = [
      ...pendingEnrichKeys,
      ...Array.from(results.values())
        .filter((r) => r.webEnrich?.phase === "ready" && r.webEnrich.canonicalKey)
        .map((r) => r.webEnrich!.canonicalKey!),
    ];
    const uniqueWatch = [...new Set(watchKeys)];
    if (uniqueWatch.length === 0 && pendingEnrichKeys.length === 0) {
      setWebQueueBanner(null);
      return;
    }

    let cancelled = false;

    async function applyReadyRows(rowNumbers: number[]) {
      const run = lastRunRef.current;
      if (!run || rowNumbers.length === 0) return;
      const toSend = rowNumbers
        .filter((n) => !reevalInFlight.current.has(n))
        .map((n) => run.rowsByNumber.get(n))
        .filter((r): r is NonNullable<typeof r> => !!r);
      if (toSend.length === 0) return;

      for (const r of toSend) reevalInFlight.current.add(r.rowNumber);
      setWebQueueBanner(
        (prev) => `${prev ? `${prev} · ` : ""}Applying web comps to ${toSend.length} lot(s)…`,
      );

      try {
        const res = await fetch("/api/batch/reeval", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rows: toSend, defaults: run.defaults }),
        });
        const json = await res.json().catch(() => null);
        if (!res.ok || cancelled) return;
        const patched = (json?.rows ?? []) as BatchResultRow[];
        if (patched.length === 0) return;

        setResults((prev) => {
          const next = new Map(prev);
          for (const row of patched) {
            next.set(row.rowNumber, row);
            const key = row.webEnrich?.canonicalKey;
            if (key) appliedReadyKeys.current.add(key);
          }
          return next;
        });
        setWebQueueBanner(
          `Applied web comps to ${patched.length} lot(s) — Max Bid / GO updated on the sheet`,
        );
      } catch {
        /* ignore; next poll may retry Ready rows */
      } finally {
        for (const r of toSend) reevalInFlight.current.delete(r.rowNumber);
      }
    }

    const tick = async () => {
      try {
        const keysToPoll =
          uniqueWatch.length > 0
            ? uniqueWatch
            : pendingEnrichKeys;
        if (keysToPoll.length === 0) return;

        const res = await fetch("/api/web-comps/status", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ keys: keysToPoll }),
        });
        const json = await res.json().catch(() => null);
        if (!res.ok || cancelled || !json?.keys) return;

        const q = json.queue as {
          depth?: number;
          processedToday?: number;
          maxPerDay?: number;
          running?: boolean;
        } | null;
        if (q && (q.depth || q.running)) {
          setWebQueueBanner(
            `Web enrich: ${q.depth ?? 0} queued · ${q.processedToday ?? 0}/${q.maxPerDay ?? 50} today` +
              (q.running ? " · running" : ""),
          );
        }

        const readyRowNums: number[] = [];

        setResults((prev) => {
          const next = new Map(prev);
          let changed = false;
          for (const [rowNum, row] of next) {
            const key = row.webEnrich?.canonicalKey;
            if (!key) continue;
            if (row.webEnrich?.phase === "oa" || row.webEnrich?.phase === "web") continue;
            const st = json.keys[key] as
              | {
                  phase: WebEnrichPhase;
                  confidence: NonNullable<BatchResultRow["webEnrich"]>["confidence"];
                  count: number;
                  domainCount: number;
                  median: number | null;
                }
              | undefined;
            if (!st) continue;
            const phase =
              st.phase === "ready" ||
              st.phase === "weak" ||
              st.phase === "running" ||
              st.phase === "queued"
                ? st.phase
                : (row.webEnrich?.phase ?? st.phase);

            if (
              (phase === "ready" || (st.confidence === "high" && st.count >= 3)) &&
              !appliedReadyKeys.current.has(key) &&
              !reevalInFlight.current.has(rowNum)
            ) {
              readyRowNums.push(rowNum);
            }

            if (
              phase === row.webEnrich?.phase &&
              st.count === row.webEnrich?.count &&
              st.confidence === row.webEnrich?.confidence
            ) {
              continue;
            }
            next.set(rowNum, {
              ...row,
              webEnrich: {
                phase,
                canonicalKey: key,
                confidence: st.confidence,
                count: st.count,
                domainCount: st.domainCount,
                median: st.median,
              },
            });
            changed = true;
          }
          return changed ? next : prev;
        });

        if (readyRowNums.length > 0) {
          void applyReadyRows([...new Set(readyRowNums)]);
        }
      } catch {
        /* ignore poll errors */
      }
    };

    void tick();
    const id = window.setInterval(() => void tick(), 5000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-subscribe when pending key set changes
  }, [pendingEnrichKey]);

  async function ingestAuction() {
    const url = auctionUrl.trim();
    if (!url) return;
    setAuctionBusy(true);
    setAuctionMsg(null);
    setError(null);
    try {
      const res = await fetch("/api/auctions/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url,
          buyerPremiumPct: Number(defaults.buyerPremiumPct) || 15,
          firearmsOnly: true,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || `Ingest failed (${res.status})`);
      setText(json.batchCsv || "");
      setAuctionMsg(
        `Loaded ${json.sheetLots?.length ?? 0} firearm lots` +
          (json.skipped ? ` (${json.skipped} non-firearm skipped)` : "") +
          (json.hasListingIncrements
            ? " · Listing next-bid / increments captured from HiBid"
            : " · No listing increments found — Settings schedule will be used") +
          (json.warnings?.length ? ` · ${json.warnings.join(" ")}` : "") +
          " · Titles parse heuristically — fix Make/Model in the sheet if needed, then Run batch",
      );
      setFileStatus({
        kind: "ok",
        message: `Auction ingest from ${json.host}`,
        fileName: url,
      });
    } catch (err) {
      setAuctionMsg(err instanceof Error ? err.message : "Ingest failed");
    } finally {
      setAuctionBusy(false);
    }
  }

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
    setIncrementHint(null);
    setWebQueueBanner(null);
    appliedReadyKeys.current.clear();
    reevalInFlight.current.clear();

    const payloadRows = evaluable.map((r: BatchRow) => ({
      rowNumber: r.rowNumber,
      lot: r.lot,
      manufacturer: r.manufacturer,
      model: r.model,
      caliber: r.caliber,
      category: r.category,
      upc: r.upc,
      lotTitle: r.rawTitle || "",
      currentBid: r.currentBid,
      requiredBid: r.requiredBid,
      bidIncrementAmount: r.bidIncrementAmount,
      buyerPremiumPct: r.buyerPremiumPct,
    }));
    if (defaults.buyerPremiumPct.trim() === "") {
      setError("Enter this auction’s buyer premium % before running.");
      return;
    }
    const payloadDefaults = {
      condition: defaults.condition,
      buyerPremiumPct: parseMoneyFieldOrZero(defaults.buyerPremiumPct),
      inboundShip: parseMoneyFieldOrZero(defaults.inboundShip),
      outboundShip:
        defaults.outboundShip.trim() === ""
          ? undefined
          : parseMoneyFieldOrZero(defaults.outboundShip),
      listingUpgrades: parseMoneyFieldOrZero(defaults.listingUpgrades),
      buyerPaysOutboundShip: defaults.buyerPaysOutboundShip,
      buyerPaysCardFee: defaults.buyerPaysCardFee,
      targetProfit: parseMoneyFieldOrZero(defaults.targetProfit),
      minMarginPct: parseMoneyFieldOrZero(defaults.minMarginPct),
      sellChannel: defaults.sellChannel,
      salesTaxPct: parseMoneyFieldOrZero(defaults.salesTaxPct),
      bidIncrements: defaults.bidIncrements,
    };
    lastRunRef.current = {
      rowsByNumber: new Map(payloadRows.map((r) => [r.rowNumber, r])),
      defaults: payloadDefaults,
    };

    try {
      const res = await fetch("/api/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rows: payloadRows,
          defaults: payloadDefaults,
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
            setIncrementHint((prev) => {
              if (prev) return prev;
              return evt.row.incrementSource === "listing"
                ? "Increments: from auction listing (required bid / step)"
                : "Increments: Settings fallback schedule";
            });
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
    const webQueued = all.filter(
      (r) => r.webEnrich?.phase === "queued" || r.webEnrich?.phase === "running",
    ).length;
    const webReady = all.filter((r) => r.webEnrich?.phase === "ready").length;
    const webDone = all.filter(
      (r) => r.webEnrich?.phase === "web" || r.webEnrich?.phase === "weak",
    ).length;
    return { evaluated: all.length, go: go.length, totalHeadroom, noComps, webQueued, webReady, webDone };
  }, [results]);

  const setD = (k: keyof typeof defaults) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setDefaults((d) => ({ ...d, [k]: e.target.value }));

  return (
    <main className="mx-auto max-w-[1800px] px-4 py-6">
      <div className="mb-6">
        <h1 className="text-lg font-semibold tracking-tight">Batch Buy-Sheet</h1>
        <p className="text-xs text-desk-muted">
          Paste or upload an auction manifest — Max Bid, GO/NO-GO, and dealer floor per lot.
        </p>
      </div>

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

          <div className="rounded-md border border-desk-border bg-desk-panel2 p-3 space-y-2">
            <p className="text-xs font-semibold text-desk-text">Paste auction URL (HiBid / Pearce)</p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                className="field-input flex-1 font-mono text-xs"
                value={auctionUrl}
                onChange={(e) => setAuctionUrl(e.target.value)}
                placeholder="https://bids.auctionbypearce.com/auctions/..."
              />
            <button
              type="button"
              disabled={auctionBusy || !auctionUrl.trim()}
              onClick={() => void ingestAuction()}
              className="rounded-md bg-desk-accent px-3 py-2 text-xs font-medium text-white disabled:opacity-40"
            >
              {auctionBusy ? "Fetching lots…" : "Load firearm lots"}
            </button>
            </div>
            <p className="text-[11px] text-desk-muted">
              Load lots from URL → review/fix Make/Model in the sheet (title heuristics, no AI) → set BP (15% for
              Pearce) → Run buy-sheet. Single-gun Max Bid: use Desk home OA Make → Model → Caliber pickers.
            </p>
            {auctionMsg && <p className="text-xs text-desk-text">{auctionMsg}</p>}
          </div>

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

          <h2 className="pt-1 text-sm font-semibold text-desk-muted">This auction</h2>
          <div className="rounded-md border border-desk-accent/40 bg-desk-accent/5 p-3">
            <div className="grid grid-cols-2 gap-3">
              <NumField
                label="Buyer premium % (this auction)"
                v={defaults.buyerPremiumPct}
                on={setD("buyerPremiumPct")}
                placeholder="e.g. 13 or 15"
              />
              <div>
                <label className="field-label">Exit channel</label>
                <select
                  className="field-input"
                  value={defaults.sellChannel}
                  onChange={(e) =>
                    setDefaults((d) => ({
                      ...d,
                      sellChannel: e.target.value as "gunbroker" | "local",
                    }))
                  }
                >
                  <option value="local">Local (AL tax)</option>
                  <option value="gunbroker">GunBroker</option>
                </select>
              </div>
            </div>
            <p className="mt-2 text-[11px] text-desk-muted">
              BP is per auction house — required. All-in = hammer × (1+BP%) + inbound (dealer inbound usually $0).
              Active:{" "}
              <span className="font-semibold text-desk-text">
                BP {defaults.buyerPremiumPct.trim() || "?"}% ·{" "}
                {defaults.sellChannel === "local" ? "Local exit" : "GunBroker exit"}
              </span>
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <NumField label="Target profit ($)" v={defaults.targetProfit} on={setD("targetProfit")} />
            <NumField label="Min margin %" v={defaults.minMarginPct} on={setD("minMarginPct")} />
            <NumField label="Inbound ship ($)" v={defaults.inboundShip} on={setD("inboundShip")} />
            {defaults.sellChannel === "local" ? (
              <NumField label="Sales tax %" v={defaults.salesTaxPct} on={setD("salesTaxPct")} />
            ) : (
              <NumField
                label="Outbound ship ($)"
                v={defaults.outboundShip}
                on={setD("outboundShip")}
                placeholder="Auto: 45 pistol / 60 rifle"
              />
            )}
            {defaults.sellChannel === "gunbroker" && (
              <NumField
                label="Listing upgrades ($)"
                v={defaults.listingUpgrades}
                on={setD("listingUpgrades")}
              />
            )}
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
            Per-row Current Bid from the CSV/auction ingest. GO / Max / Profit use the exit channel above.
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
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
                <SummaryStat label="Lots evaluated" value={String(summary.evaluated)} />
                <SummaryStat label="GO lots" value={String(summary.go)} tone="go" />
                <SummaryStat label="Total headroom (GO)" value={usd(summary.totalHeadroom)} tone="go" />
                <SummaryStat label="No comps found" value={String(summary.noComps)} tone={summary.noComps ? "nogo" : undefined} />
                <SummaryStat
                  label="Web enriching"
                  value={String(summary.webQueued)}
                  tone={summary.webQueued ? "warn" : undefined}
                />
                <SummaryStat
                  label="Web ready / applying"
                  value={String(summary.webReady)}
                  tone={summary.webReady ? "go" : undefined}
                />
              </div>

              {webQueueBanner && (
                <p className="rounded-md border border-desk-warn/40 bg-desk-warn/10 px-3 py-2 text-xs text-desk-text">
                  {webQueueBanner}
                </p>
              )}

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
                <table className="w-full min-w-[1480px] text-sm">
                  <thead className="text-left text-xs uppercase text-desk-muted">
                    <tr>
                      <th className="py-1">Lot</th>
                      <th>Item</th>
                      <th>Verdict</th>
                      <th>Trust</th>
                      <th className="text-right">Market med</th>
                      <th className="text-right">Decision P25</th>
                      <th className="text-right">Current</th>
                      <th className="text-right">Next</th>
                      <th className="text-right">All-in@next</th>
                      <th className="text-right">Max bid</th>
                      <th className="text-right">Walk</th>
                      <th className="text-right">Headroom</th>
                      <th className="text-right">Profit@next</th>
                      <th className="text-right">Dealer floor</th>
                      <th className="text-right">Comps</th>
                    </tr>
                  </thead>
                  <tbody className="num">
                    {rows.map((r) => {
                      const webBadge = webEnrichBadge(r.webEnrich?.phase);
                      const marketValue = r.estimatedGrossResale ?? r.soldMedian ?? null;
                      const marketNote = r.grossResaleNote ?? undefined;
                      const trustLabel =
                        r.divergence === "cooling"
                          ? "Cooling"
                          : r.divergence === "asks_rich"
                            ? "Asks rich"
                            : r.divergence === "ok"
                              ? "OK"
                              : webBadge.label;
                      const trustClass =
                        r.divergence === "cooling"
                          ? "text-desk-nogo"
                          : r.divergence === "asks_rich"
                            ? "text-desk-warn"
                            : r.divergence === "ok"
                              ? "text-desk-go"
                              : webBadge.className;
                      return (
                      <tr
                        key={r.rowNumber}
                        className={`border-t border-desk-border ${
                          r.verdict === "GO" ? "bg-desk-go/5" : ""
                        }`}
                      >
                        <td className="py-1.5 font-sans">{r.lot}</td>
                        <td className="max-w-[260px] font-sans">
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
                            {r.incrementSource ? ` · ${r.incrementSource}` : ""}
                            {r.askMedian != null ? ` · asks ~$${Math.round(r.askMedian)}` : ""}
                          </div>
                          {r.matchWarnings?.length > 0 && (
                            <div
                              className="mt-0.5 truncate text-[10px] font-medium text-desk-nogo"
                              title={r.matchWarnings.join(" · ")}
                            >
                              ⚠ {r.matchWarnings[0]}
                              {r.matchWarnings.length > 1
                                ? ` (+${r.matchWarnings.length - 1})`
                                : ""}
                            </div>
                          )}
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
                        <td className="font-sans">
                          <span className={`text-[11px] font-semibold ${trustClass}`} title={webBadge.title}>
                            {trustLabel}
                          </span>
                        </td>
                        <td className="text-right" title={marketNote}>
                          {marketValue != null ? (
                            <div>
                              <div className="num font-semibold text-desk-text">{usd(marketValue)}</div>
                              <div className="text-[10px] font-sans text-desk-muted">OA med</div>
                            </div>
                          ) : (
                            <span className="text-desk-muted">—</span>
                          )}
                        </td>
                        <td className="text-right">
                          {r.decisionP25 != null ? (
                            <div>
                              <div className="num font-semibold">{usd(r.decisionP25)}</div>
                              <div className="text-[10px] font-sans text-desk-muted">sold P25</div>
                            </div>
                          ) : (
                            <span className="text-desk-muted">—</span>
                          )}
                        </td>
                        <td className="text-right">{usd(r.currentBid)}</td>
                        <td className="text-right font-semibold">{usd(r.nextBid)}</td>
                        <td className="text-right" title={`BP ${r.buyerPremiumPct}%`}>
                          {usd(r.allInAtNext)}
                        </td>
                        <td className="text-right">{usd(r.maxBid)}</td>
                        <td className="text-right font-semibold">{usd(r.walkAwayBid ?? r.walkAway)}</td>
                        <td
                          className={`text-right font-semibold ${
                            r.headroom == null ? "text-desk-muted" : r.headroom >= 0 ? "text-desk-go" : "text-desk-nogo"
                          }`}
                        >
                          {r.headroom == null ? "—" : `${r.headroom >= 0 ? "+" : ""}${usd(r.headroom)}`}
                        </td>
                        <td className={`text-right ${r.netProfit != null && r.netProfit >= 0 ? "text-desk-go" : "text-desk-nogo"}`}>
                          {usd(r.netProfit)}
                          <div className="text-[10px] font-sans text-desk-muted">
                            {r.sellChannel === "local" ? "local" : "GB"}
                          </div>
                        </td>
                        <td className="text-right">{usd(r.dealerFloor)}</td>
                        <td className="text-right text-desk-muted">{r.soldCount || "—"}</td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
                <p className="mt-3 text-[11px] text-desk-muted">
                  {incrementHint ? <span className="text-desk-text">{incrementHint}. </span> : null}
                  <strong className="text-desk-text">GO</strong> uses <em>next</em> bid + this auction&apos;s BP
                  and your exit channel. <strong className="text-desk-text">Market med</strong> = OA sold
                  median (context). <strong className="text-desk-text">Decision P25</strong> drives Max Bid
                  (capped when Trust = Cooling). All-in@next = next × (1+BP%) + inbound. Street asks never
                  replace solds — they sanity-check them.
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

function SummaryStat(props: { label: string; value: string; tone?: "go" | "nogo" | "warn" }) {
  return (
    <div className="panel py-3">
      <div className="field-label">{props.label}</div>
      <div
        className={`num text-lg font-bold ${
          props.tone === "go"
            ? "text-desk-go"
            : props.tone === "nogo"
              ? "text-desk-nogo"
              : props.tone === "warn"
                ? "text-desk-warn"
                : "text-desk-text"
        }`}
      >
        {props.value}
      </div>
    </div>
  );
}
