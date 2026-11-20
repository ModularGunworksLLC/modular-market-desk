"use client";

import { useState } from "react";

import {
  callChipClass,
  confClass,
  displayCall,
  displayConf,
} from "@/lib/batch/call-display";
import type { BatchResultRow } from "@/lib/batch/types";
import { usd } from "@/lib/format";

import { maxBidHammer, payAtHammer } from "./BatchSheetTable";

export function LotDetailPanel(props: {
  row: BatchResultRow | null;
  sellChannel: "gunbroker" | "local";
  targetProfit: number;
}) {
  const { row, sellChannel, targetProfit } = props;
  const [whyOpen, setWhyOpen] = useState(false);

  if (!row) {
    return (
      <aside className="rounded-lg border border-desk-border bg-desk-panel p-4 text-sm text-desk-muted">
        Select a lot to see hard-stop detail.
      </aside>
    );
  }

  const call = displayCall(row);
  const conf = displayConf(row);
  const maxBid = maxBidHammer(row);
  const live = row.currentBid ?? row.nextBid;
  const allInLive =
    row.allInAtCurrent ??
    (row.currentBid != null ? payAtHammer(row, row.currentBid) : null) ??
    row.allInAtNext;
  const headroom =
    row.headroom ??
    (maxBid != null && live != null ? Math.round((maxBid - live) * 100) / 100 : null);
  const channelLabel = sellChannel === "gunbroker" ? "GB" : "Local";
  const profitAtNext = sellChannel === "gunbroker" ? row.netProfitGb : row.netProfitLocal;
  const fmv = row.decisionP25 ?? row.soldMedian ?? row.estimatedGrossResale;
  const auditParts = [
    fmv != null ? `${channelLabel === "GB" ? "safe sell" : "local"} ${usd(fmv)}` : null,
    `− fees − $${Math.round(targetProfit)} profit`,
    `BP ${row.buyerPremiumPct}%`,
    (row.purchaseCardPct ?? 0) > 0 ? `card ${row.purchaseCardPct}%` : null,
    maxBid != null ? `≈ max ${usd(maxBid)}` : null,
  ].filter(Boolean);

  return (
    <aside className="sticky top-3 space-y-3 rounded-lg border border-desk-border bg-desk-panel p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-wide text-desk-muted">Lot {row.lot}</div>
          <h3 className="truncate text-base font-semibold text-desk-text" title={row.label}>
            {row.label}
          </h3>
          <p className="mt-0.5 whitespace-normal break-words text-[11px] text-desk-muted" title={row.matchNote}>
            {row.matchNote || "—"}
            {row.soldCount > 0 ? ` · n=${row.soldCount}` : ""}
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${callChipClass(call)}`}
        >
          {call}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Metric label="Live bid" value={usd(live)} />
        <Metric
          label="Hard-stop max"
          value={usd(maxBid)}
          emphasize
          title={`Highest legal paddle for ${channelLabel}`}
        />
        <Metric label="All-in @ live" value={usd(allInLive)} />
        <Metric
          label="Headroom"
          value={
            headroom == null ? "—" : `${headroom >= 0 ? "+" : ""}${usd(headroom)}`
          }
          tone={headroom == null ? undefined : headroom >= 0 ? "go" : "nogo"}
        />
      </div>

      {profitAtNext != null && (
        <p className="text-[11px] text-desk-muted">
          Est. profit @ next ({channelLabel}):{" "}
          <span className={profitAtNext >= 0 ? "text-desk-go" : "text-desk-nogo"}>
            {usd(profitAtNext)}
          </span>
        </p>
      )}

      <p className="text-[11px] leading-snug text-desk-muted">
        <span className="font-semibold text-desk-text">Audit: </span>
        {auditParts.join(" · ") || "—"}
      </p>

      <div className="grid grid-cols-3 gap-1.5 text-center">
        <FmvBox label="Decision P25" value={row.decisionP25} />
        <FmvBox label="Typical" value={row.soldMedian ?? row.estimatedGrossResale} />
        <FmvBox label="Conf" value={null} text={conf} className={confClass(conf)} />
      </div>

      <button
        type="button"
        onClick={() => setWhyOpen((v) => !v)}
        className="w-full rounded-md border border-desk-border bg-desk-panel2 px-3 py-2 text-left text-xs font-semibold text-desk-text"
      >
        {whyOpen ? "Hide" : "Why"} / match · comps · fees
      </button>

      {whyOpen && (
        <div className="space-y-2 rounded-md border border-desk-border bg-desk-panel2 p-3 text-[11px] text-desk-muted">
          <p>
            <span className="text-desk-text">Engine verdict:</span> {row.verdict ?? "—"} (GB{" "}
            {row.verdictGb ?? "—"} / Local {row.verdictLocal ?? "—"})
          </p>
          <p>
            <span className="text-desk-text">Max GB / Local:</span> {usd(row.maxBidGb)} /{" "}
            {usd(row.maxBidLocal)}
          </p>
          <p>
            <span className="text-desk-text">All-in @ next / @ max:</span> {usd(row.allInAtNext)} /{" "}
            {usd(payAtHammer(row, maxBid))}
          </p>
          <p>
            <span className="text-desk-text">Dealer floor:</span> {usd(row.dealerFloor)}
            {row.bestDealer ? ` · ${row.bestDealer}` : ""}
          </p>
          <p>
            <span className="text-desk-text">Sold comps:</span> n={row.soldCount}
            {row.oaCatalog
              ? ` · OA ${row.oaCatalog.manufacturer} ${row.oaCatalog.model} (score ${row.oaCatalog.score})`
              : ""}
          </p>
          {row.matchWarnings?.length > 0 && (
            <p className="text-desk-nogo">⚠ {row.matchWarnings.join(" · ")}</p>
          )}
          {row.newDealerWarning && <p className="text-desk-nogo">{row.newDealerWarning}</p>}
          {row.error && <p className="text-desk-nogo">Error: {row.error}</p>}
          {row.grossResaleNote && <p>{row.grossResaleNote}</p>}
        </div>
      )}
    </aside>
  );
}

function Metric(props: {
  label: string;
  value: string;
  emphasize?: boolean;
  tone?: "go" | "nogo";
  title?: string;
}) {
  const toneClass =
    props.tone === "go" ? "text-desk-go" : props.tone === "nogo" ? "text-desk-nogo" : "text-desk-text";
  return (
    <div className="rounded-md border border-desk-border bg-desk-panel2 px-2.5 py-2" title={props.title}>
      <div className="text-[10px] uppercase tracking-wide text-desk-muted">{props.label}</div>
      <div
        className={`num mt-0.5 font-black tabular-nums ${props.emphasize ? "text-xl text-desk-accent" : "text-lg"} ${toneClass}`}
      >
        {props.value}
      </div>
    </div>
  );
}

function FmvBox(props: {
  label: string;
  value: number | null | undefined;
  text?: string;
  className?: string;
}) {
  return (
    <div className="rounded border border-desk-border bg-desk-bg/40 px-1.5 py-1.5">
      <div className="text-[9px] uppercase text-desk-muted">{props.label}</div>
      <div className={`num text-sm font-bold ${props.className ?? "text-desk-text"}`}>
        {props.text ?? usd(props.value ?? null)}
      </div>
    </div>
  );
}
