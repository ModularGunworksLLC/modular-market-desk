"use client";

import { usd } from "@/lib/format";
import type { TgvAdvisoryStats } from "@/lib/tgv/store";

type Props = {
  tgv: TgvAdvisoryStats;
};

/** Local TGV bank stub — advisory FMV only; never drives Max Bid. */
export function TgvAdvisoryPanel({ tgv }: Props) {
  const path = tgv.tgvPath?.startsWith("http")
    ? tgv.tgvPath
    : tgv.tgvPath
      ? `https://truegunvalue.com${tgv.tgvPath}`
      : null;

  return (
    <div className="panel space-y-2 border-desk-border">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-desk-text">TGV local bank</p>
          <p className="text-[11px] text-desk-muted">
            source: tgv · advisory only — Max Bid still OA-only
          </p>
        </div>
        <span className="num text-[11px] uppercase tracking-wide text-desk-muted">
          {tgv.match === "exact" ? "exact match" : "fuzzy match"} · n={tgv.soldCount}
        </span>
      </div>

      <p className="text-xs text-desk-text">
        {tgv.manufacturer} {tgv.model}
        <span className="text-desk-muted"> · {tgv.category}</span>
      </p>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[320px] border-collapse text-left text-xs">
          <thead>
            <tr className="border-b border-desk-border text-[11px] uppercase tracking-wide text-desk-muted">
              <th className="py-1 pr-3 font-medium"> </th>
              <th className="py-1 pr-3 font-medium num">Used</th>
              <th className="py-1 font-medium num">New</th>
            </tr>
          </thead>
          <tbody className="num text-desk-text">
            <tr className="border-b border-desk-border/60">
              <td className="py-1.5 pr-3 text-desk-muted">Private party</td>
              <td className="py-1.5 pr-3">{money(tgv.privatePartyUsed)}</td>
              <td className="py-1.5">{money(tgv.privatePartyNew)}</td>
            </tr>
            <tr className="border-b border-desk-border/60">
              <td className="py-1.5 pr-3 text-desk-muted">Trade-in</td>
              <td className="py-1.5 pr-3">{money(tgv.tradeInUsed)}</td>
              <td className="py-1.5">{money(tgv.tradeInNew)}</td>
            </tr>
            <tr>
              <td className="py-1.5 pr-3 text-desk-muted">12mo avg</td>
              <td className="py-1.5 pr-3">{money(tgv.avg12mUsed)}</td>
              <td className="py-1.5">{money(tgv.avg12mNew)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-desk-muted">
        {tgv.usedSoldCount != null && <span>used solds {tgv.usedSoldCount}</span>}
        {tgv.newSoldCount != null && <span>new solds {tgv.newSoldCount}</span>}
        {tgv.syncedAt && <span>synced {tgv.syncedAt.slice(0, 10)}</span>}
        {path && (
          <a className="text-desk-accent hover:underline" href={path} target="_blank" rel="noreferrer">
            TGV page
          </a>
        )}
      </div>
    </div>
  );
}

function money(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return usd(n);
}
