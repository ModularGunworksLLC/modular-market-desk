"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { intFmt, timeAgo } from "@/lib/format";
import type {
  MarketsCategoryFilter,
  MarketsConditionFilter,
  MarketsSummary,
  NameCount,
} from "@/lib/markets/types";

type SummaryResponse = MarketsSummary & { ok: true } | { ok: false; error: string };

const CONDITIONS: { id: MarketsConditionFilter; label: string }[] = [
  { id: "ANY", label: "Any" },
  { id: "USED", label: "Used" },
  { id: "NEW", label: "New" },
];

const CATEGORIES: { id: MarketsCategoryFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "handgun", label: "Handgun" },
  { id: "rifle", label: "Rifle" },
  { id: "shotgun", label: "Shotgun" },
];

function Chip({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
        active
          ? "bg-desk-accent/20 text-desk-text"
          : "border border-desk-border text-desk-muted hover:border-desk-accent hover:text-desk-text"
      }`}
    >
      {label}
    </button>
  );
}

function SeasonalityBars({ rows }: { rows: MarketsSummary["seasonality"] }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <div className="flex h-40 items-end gap-1.5 sm:gap-2">
      {rows.map((r) => {
        const pct = (r.count / max) * 100;
        return (
          <div key={r.month} className="flex min-w-0 flex-1 flex-col items-center gap-1">
            <span className="num text-[10px] text-desk-muted">{r.count > 0 ? intFmt(r.count) : ""}</span>
            <div className="flex h-28 w-full items-end justify-center">
              <div
                className="w-full max-w-[28px] rounded-sm bg-desk-accent/70"
                style={{ height: `${Math.max(r.count > 0 ? 4 : 0, pct)}%` }}
                title={`${r.label}: ${intFmt(r.count)}`}
              />
            </div>
            <span className="text-[10px] uppercase text-desk-muted">{r.label}</span>
          </div>
        );
      })}
    </div>
  );
}

function RankTable({ title, rows }: { title: string; rows: NameCount[] }) {
  return (
    <section className="panel">
      <h2 className="mb-3 text-sm font-semibold text-desk-muted">{title}</h2>
      {rows.length === 0 ? (
        <p className="text-sm text-desk-muted">No solds in this filter.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[220px] text-sm">
            <thead className="text-left text-[10px] uppercase text-desk-muted">
              <tr>
                <th className="py-1 pr-2">#</th>
                <th className="py-1">Name</th>
                <th className="py-1 text-right">Solds</th>
              </tr>
            </thead>
            <tbody className="num">
              {rows.map((r, i) => (
                <tr key={r.name} className="border-t border-desk-border">
                  <td className="py-1.5 pr-2 text-desk-muted">{i + 1}</td>
                  <td className="py-1.5 font-sans text-desk-text">{r.name}</td>
                  <td className="py-1.5 text-right">{intFmt(r.count)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export function MarketsDashboard() {
  const [mounted, setMounted] = useState(false);
  const [condition, setCondition] = useState<MarketsConditionFilter>("USED");
  const [category, setCategory] = useState<MarketsCategoryFilter>("all");
  const [data, setData] = useState<MarketsSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setMounted(true);
  }, []);

  const load = useCallback(async (c: MarketsConditionFilter, cat: MarketsCategoryFilter) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/markets/summary?condition=${encodeURIComponent(c)}&category=${encodeURIComponent(cat)}`,
      );
      const json = (await res.json()) as SummaryResponse;
      if (!res.ok || !json.ok) {
        setData(null);
        setError("error" in json ? json.error : `HTTP ${res.status}`);
        return;
      }
      setData(json);
    } catch (err) {
      setData(null);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!mounted) return;
    void load(condition, category);
  }, [mounted, condition, category, load]);

  if (!mounted) {
    return (
      <main className="mx-auto max-w-[1800px] px-4 py-6">
        <h1 className="text-lg font-semibold tracking-tight">Markets</h1>
        <p className="mt-2 text-sm text-desk-muted">Loading market aggregates…</p>
      </main>
    );
  }

  const cov = data?.coverage;

  return (
    <main className="mx-auto max-w-[1800px] px-4 py-6">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Markets</h1>
          <p className="text-xs text-desk-muted">
            OA sold seasonality &amp; liquidity — local bank only
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/evaluate"
            className="rounded-md border border-desk-border bg-desk-panel2 px-3 py-1.5 text-xs font-medium text-desk-text hover:border-desk-accent"
          >
            Open Evaluate
          </Link>
          <Link
            href="/batch"
            className="rounded-md border border-desk-border bg-desk-panel2 px-3 py-1.5 text-xs font-medium text-desk-text hover:border-desk-accent"
          >
            Open Batch
          </Link>
          <Link
            href="/import"
            className="rounded-md border border-desk-border bg-desk-panel2 px-3 py-1.5 text-xs font-medium text-desk-text hover:border-desk-accent"
          >
            Run OA sync
          </Link>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-4">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] uppercase text-desk-muted">Condition</span>
          {CONDITIONS.map((c) => (
            <Chip
              key={c.id}
              label={c.label}
              active={condition === c.id}
              onClick={() => setCondition(c.id)}
            />
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] uppercase text-desk-muted">Category</span>
          {CATEGORIES.map((c) => (
            <Chip
              key={c.id}
              label={c.label}
              active={category === c.id}
              onClick={() => setCategory(c.id)}
            />
          ))}
        </div>
      </div>

      {error && (
        <div className="panel mb-4 border-desk-nogo">
          <p className="text-sm text-desk-nogo">{error}</p>
        </div>
      )}

      {loading && !data && (
        <p className="mb-4 text-sm text-desk-muted">Loading market aggregates…</p>
      )}

      {cov && (
        <section className="panel mb-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-desk-muted">OA coverage</h2>
            {loading && <span className="text-[10px] text-desk-muted">Refreshing…</span>}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <Stat label="Leaves" value={intFmt(cov.leafCount)} />
            <Stat label="With solds" value={intFmt(cov.leavesWithSolds)} />
            <Stat label="Active 30d" value={intFmt(cov.leavesWith30d)} />
            <Stat label="Active 90d" value={intFmt(cov.leavesWith90d)} />
            <Stat label="% w/ 90d solds" value={`${cov.pctWith90d}%`} />
            <Stat label="Sold rows" value={intFmt(cov.soldCompRows)} />
          </div>
          <p className="mt-3 text-[11px] text-desk-muted">
            Last sync:{" "}
            {cov.lastSyncAt
              ? `${cov.lastSyncKind ?? "?"} · ${cov.lastSyncStatus ?? "?"} · ${timeAgo(cov.lastSyncAt)}`
              : "none yet"}
            {data?.generatedAt ? ` · Snapshot ${timeAgo(data.generatedAt)}` : null}
          </p>
        </section>
      )}

      <div className="mb-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <section className="panel xl:col-span-2">
          <h2 className="mb-3 text-sm font-semibold text-desk-muted">Solds by month</h2>
          {data ? (
            <SeasonalityBars rows={data.seasonality} />
          ) : (
            <div className="h-40 animate-pulse rounded-md bg-desk-panel2" />
          )}
          <p className="mt-2 text-[11px] text-desk-muted">
            Calendar month of sale date across the current OA bank (not a year-over-year series).
          </p>
        </section>

        <section className="panel">
          <h2 className="mb-3 text-sm font-semibold text-desk-muted">Liquidity bands</h2>
          {cov ? (
            <div className="space-y-2 text-sm">
              <LiquidityRow
                label="Sold in last 30d"
                count={cov.leavesWith30d}
                total={cov.leafCount}
              />
              <LiquidityRow
                label="Sold in last 90d"
                count={cov.leavesWith90d}
                total={cov.leafCount}
              />
              <LiquidityRow
                label="Solds on record"
                count={cov.leavesWithSolds}
                total={cov.leafCount}
              />
              <LiquidityRow
                label="No solds"
                count={Math.max(0, cov.leafCount - cov.leavesWithSolds)}
                total={cov.leafCount}
              />
            </div>
          ) : (
            <div className="h-32 animate-pulse rounded-md bg-desk-panel2" />
          )}
        </section>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <RankTable title="Hot brands · 90d" rows={data?.topManufacturers90d ?? []} />
        <RankTable title="Hot brands · all" rows={data?.topManufacturersAll ?? []} />
        <RankTable title="Hot calibers · 90d" rows={data?.topCalibers90d ?? []} />
        <RankTable title="Hot calibers · all" rows={data?.topCalibersAll ?? []} />
      </div>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-desk-muted">{label}</div>
      <div className="num mt-0.5 text-lg font-semibold text-desk-text">{value}</div>
    </div>
  );
}

function LiquidityRow({
  label,
  count,
  total,
}: {
  label: string;
  count: number;
  total: number;
}) {
  const pct = total > 0 ? Math.round((count / total) * 1000) / 10 : 0;
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs">
        <span className="text-desk-muted">{label}</span>
        <span className="num text-desk-text">
          {intFmt(count)} · {pct}%
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-desk-panel2">
        <div className="h-full rounded-full bg-desk-accent/70" style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
    </div>
  );
}
