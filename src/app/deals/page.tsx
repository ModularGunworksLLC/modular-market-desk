"use client";

import Link from "next/link";
import { useState } from "react";

import { DEAL_DEFAULTS } from "@/lib/arbitrage/constants";
import type { ScanResultRow, ScanSummary } from "@/lib/wholesale-scan";
import { usd } from "@/lib/format";

export default function DealsPage() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<ScanSummary | null>(null);
  const [limit, setLimit] = useState(30);
  const [targetProfit, setTargetProfit] = useState(DEAL_DEFAULTS.targetProfit);

  async function runScan() {
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/wholesale/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vendor: "2ndamendmentwholesale",
          limit,
          targetProfit,
          inboundShip: 0,
        }),
      });
      const body = (await res.json()) as ScanSummary & { ok?: boolean; error?: string };
      if (!res.ok) {
        setError(body.error ?? `HTTP ${res.status}`);
        setSummary(null);
        return;
      }
      setSummary(body);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSummary(null);
    } finally {
      setPending(false);
    }
  }

  const goRows = summary?.rows.filter((r) => r.verdict === "GO") ?? [];

  return (
    <main className="mx-auto max-w-[1800px] px-4 py-6">
      <header className="mb-6 flex flex-wrap items-baseline justify-between gap-3">
        <div className="flex items-baseline gap-4">
          <h1 className="text-xl font-semibold tracking-tight">Wholesale deal scanner</h1>
          <Link href="/" className="text-sm text-desk-accent hover:underline">
            &larr; Desk
          </Link>
          <Link href="/import" className="text-sm text-desk-accent hover:underline">
            Import / sync
          </Link>
        </div>
        <span className="text-xs text-desk-muted">2nd Amendment Wholesale · GB exit math</span>
      </header>

      <section className="panel mb-4">
        <p className="mb-3 text-sm text-desk-muted">
          Scans your imported <strong>2AW</strong> in-stock firearms, pulls live GunBroker sold comps,
          and ranks buys that clear your profit target. Sync the catalog on{" "}
          <Link href="/import" className="text-desk-accent hover:underline">
            /import
          </Link>{" "}
          first.
        </p>
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="field-label">Max guns to evaluate</label>
            <input
              className="field-input w-24"
              type="number"
              min={1}
              max={100}
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value))}
            />
          </div>
          <div>
            <label className="field-label">Target profit ($)</label>
            <input
              className="field-input w-24"
              type="number"
              min={0}
              value={targetProfit}
              onChange={(e) => setTargetProfit(Number(e.target.value))}
            />
          </div>
          <button
            type="button"
            onClick={runScan}
            disabled={pending}
            className="rounded-md bg-desk-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {pending ? "Scanning (GBA calls are slow)..." : "Scan 2AW catalog"}
          </button>
        </div>
        {error && <p className="mt-3 text-sm text-desk-nogo">{error}</p>}
        {summary?.tokenMissing && (
          <p className="mt-3 text-sm text-desk-nogo">
            No Outdoor Analytics token — paste one on /import to get live comps and GO verdicts.
          </p>
        )}
        {summary && !error && (
          <p className="mt-3 text-sm text-desk-go">
            Evaluated {summary.scanned} firearms · <strong>{summary.goCount} GO</strong> at ≥$
            {targetProfit} target
          </p>
        )}
      </section>

      {goRows.length > 0 && (
        <section className="panel overflow-x-auto">
          <h2 className="mb-3 text-sm font-semibold text-desk-go">GO — buy candidates</h2>
          <table className="w-full min-w-[900px] text-sm">
            <thead className="text-left text-xs uppercase text-desk-muted">
              <tr>
                <th className="py-1">Product</th>
                <th>Dealer $</th>
                <th>Net</th>
                <th>Margin</th>
                <th>Sold med</th>
                <th>Comps</th>
              </tr>
            </thead>
            <tbody className="num">
              {goRows.map((r) => (
                <DealRow key={`${r.sku ?? r.upc ?? r.productLabel}`} row={r} />
              ))}
            </tbody>
          </table>
        </section>
      )}

      {summary && summary.rows.length > goRows.length && (
        <section className="panel mt-4 overflow-x-auto">
          <h2 className="mb-3 text-sm font-semibold text-desk-muted">NO-GO / no comps</h2>
          <table className="w-full min-w-[900px] text-sm">
            <thead className="text-left text-xs uppercase text-desk-muted">
              <tr>
                <th className="py-1">Product</th>
                <th>Dealer $</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody className="num">
              {summary.rows
                .filter((r) => r.verdict !== "GO")
                .slice(0, 40)
                .map((r) => (
                  <tr key={`nogo-${r.sku ?? r.upc ?? r.productLabel}`} className="border-t border-desk-border">
                    <td className="py-1.5 font-sans">{r.productLabel}</td>
                    <td>{usd(r.dealerPrice)}</td>
                    <td className="font-sans text-xs text-desk-muted">{r.gbaStatus}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </section>
      )}
    </main>
  );
}

function DealRow({ row }: { row: ScanResultRow }) {
  return (
    <tr className="border-t border-desk-border">
      <td className="py-1.5 font-sans">
        <div>{row.productLabel}</div>
        <div className="text-xs text-desk-muted">
          {row.manufacturer} · {row.caliber || row.category}
        </div>
      </td>
      <td>{usd(row.dealerPrice)}</td>
      <td className="text-desk-go">+{usd(row.netProfit)}</td>
      <td>{row.marginPct.toFixed(1)}%</td>
      <td>{row.soldMedian != null ? usd(row.soldMedian) : "—"}</td>
      <td className="font-sans text-xs text-desk-muted">{row.soldCount}</td>
    </tr>
  );
}
