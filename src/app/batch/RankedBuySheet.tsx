"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import {
  callChipClass,
  confClass,
  displayCall,
  displayConf,
} from "@/lib/batch/call-display";
import type { BatchResultRow } from "@/lib/batch/types";
import { usd } from "@/lib/format";

import { maxBidHammer } from "./BatchSheetTable";
import { LotDetailPanel } from "./LotDetailPanel";

export function RankedBuySheet(props: {
  rows: BatchResultRow[];
  sellChannel: "gunbroker" | "local";
  targetProfit: number;
  buyerPremiumPct: number;
  purchaseCardPct: number;
  auctionLabel?: string;
  auctionUrl?: string;
  toolbar?: ReactNode;
}) {
  const {
    rows,
    sellChannel,
    targetProfit,
    buyerPremiumPct,
    purchaseCardPct,
    auctionLabel,
    auctionUrl,
    toolbar,
  } = props;

  const [selected, setSelected] = useState<number | null>(null);
  const tableRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (rows.length === 0) {
      setSelected(null);
      return;
    }
    setSelected((prev) => {
      if (prev != null && rows.some((r) => r.rowNumber === prev)) return prev;
      return rows[0]!.rowNumber;
    });
  }, [rows]);

  const selectedRow = useMemo(
    () => rows.find((r) => r.rowNumber === selected) ?? null,
    [rows, selected],
  );

  const walkList = useMemo(() => {
    return rows.filter((r) => {
      const max = maxBidHammer(r);
      const live = r.currentBid ?? r.nextBid;
      if (max == null || live == null) return false;
      return live > max;
    });
  }, [rows]);

  useEffect(() => {
    const el = tableRef.current;
    if (!el) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      if (rows.length === 0) return;
      e.preventDefault();
      const idx = rows.findIndex((r) => r.rowNumber === selected);
      const next =
        e.key === "ArrowDown"
          ? Math.min(rows.length - 1, Math.max(0, idx) + 1)
          : Math.max(0, (idx < 0 ? 0 : idx) - 1);
      setSelected(rows[next]!.rowNumber);
    };
    el.addEventListener("keydown", onKey);
    return () => el.removeEventListener("keydown", onKey);
  }, [rows, selected]);

  const channelLabel = sellChannel === "gunbroker" ? "GunBroker" : "Local";
  const auctionTitle =
    auctionLabel ||
    (auctionUrl
      ? (() => {
          try {
            return new URL(auctionUrl).hostname.replace(/^www\./, "");
          } catch {
            return "Auction";
          }
        })()
      : "Auction sheet");

  return (
    <div className="space-y-3">
      <div className="sticky top-0 z-20 -mx-1 border-b border-desk-border bg-desk-bg/95 px-1 py-2 backdrop-blur">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          <div className="min-w-0 flex-1">
            <div className="truncate font-semibold text-desk-text">{auctionTitle}</div>
            {auctionUrl ? (
              <a
                href={auctionUrl}
                target="_blank"
                rel="noreferrer"
                className="truncate text-[11px] text-desk-accent hover:underline"
              >
                {auctionUrl}
              </a>
            ) : null}
          </div>
          <Assumption label="Buyer premium" value={`${buyerPremiumPct}%`} />
          <Assumption label="Buyer card" value={`${purchaseCardPct}%`} />
          <Assumption label="Target profit" value={`$${Math.round(targetProfit)}`} />
          <Assumption label="Exit" value={channelLabel} />
        </div>
        <p className="mt-1 text-[11px] text-desk-muted">
          Max hammer backs out of the {channelLabel} net using this house: (max all-in − inbound) / ((1+
          {buyerPremiumPct}%)×(1+{purchaseCardPct}%)), after the ${Math.round(targetProfit)} profit floor and the margin floor.
          Walk-away is min(that hammer, (dealer floor − $25 − inbound) / (1+BP+card)). No walk-away without comps.
        </p>
        {toolbar ? <div className="mt-2 flex flex-wrap items-center gap-2">{toolbar}</div> : null}
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1.65fr)_minmax(300px,1fr)]">
        <div
          ref={tableRef}
          tabIndex={0}
          className="panel overflow-x-auto outline-none focus-visible:ring-1 focus-visible:ring-desk-accent"
        >
          <table className="w-full min-w-[640px] text-sm">
            <thead className="text-left text-[10px] uppercase tracking-wide text-desk-muted">
              <tr>
                <th className="py-1.5 pr-2">Lot</th>
                <th className="pr-2">Gun</th>
                <th className="pr-2 text-right">Live</th>
                <th className="pr-2 text-right">Max</th>
                <th className="pr-2 text-right">Headroom</th>
                <th className="pr-2">Conf</th>
                <th>Call</th>
              </tr>
            </thead>
            <tbody className="num">
              {rows.map((r) => {
                const call = displayCall(r);
                const conf = displayConf(r);
                const maxBid = maxBidHammer(r);
                const live = r.currentBid ?? r.nextBid;
                const head =
                  r.headroom ??
                  (maxBid != null && live != null
                    ? Math.round((maxBid - live) * 100) / 100
                    : null);
                const isSel = r.rowNumber === selected;
                return (
                  <tr
                    key={r.rowNumber}
                    onClick={() => setSelected(r.rowNumber)}
                    className={`cursor-pointer border-t border-desk-border transition-colors ${
                      isSel
                        ? "bg-desk-accent/15 ring-1 ring-inset ring-desk-accent/50"
                        : call === "GO"
                          ? "hover:bg-desk-go/5"
                          : "hover:bg-desk-panel2"
                    }`}
                  >
                    <td className="py-2 pr-2 font-sans text-xs font-semibold">{r.lot}</td>
                    <td className="max-w-[220px] pr-2 font-sans">
                      <div className="truncate font-medium text-desk-text" title={r.label}>
                        {r.label}
                      </div>
                      <div className="whitespace-normal break-words text-[10px] text-desk-muted" title={r.matchNote}>
                        {r.matchNote || "—"}
                        {r.soldCount > 0 ? ` · n=${r.soldCount}` : ""}
                      </div>
                      {(r.accessories?.length || r.flags?.length || r.partsWarning) ? (
                        <div className="mt-0.5 flex flex-wrap gap-1" title={[...(r.flags ?? []), ...(r.accessories ?? [])].join(", ")}>
                          {(r.flags ?? []).map((flag) => (
                            <span
                              key={flag}
                              className={`rounded px-1 py-0.5 text-[9px] uppercase ${
                                flag === "parts"
                                  ? "bg-desk-nogo/15 text-desk-nogo"
                                  : "bg-desk-panel2 text-desk-muted"
                              }`}
                            >
                              {flag}
                            </span>
                          ))}
                          {(r.accessories ?? []).map((item) => (
                            <span key={item} className="rounded bg-desk-panel2 px-1 py-0.5 text-[9px] text-desk-muted">
                              w/ {item}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </td>
                    <td className="pr-2 text-right tabular-nums">{usd(live)}</td>
                    <td
                      className={`pr-2 text-right text-base font-black tabular-nums ${
                        r.verdict === "GO" ? "text-desk-go" : "text-desk-text"
                      }`}
                    >
                      {usd(maxBid)}
                    </td>
                    <td
                      className={`pr-2 text-right font-semibold tabular-nums ${
                        head == null
                          ? "text-desk-muted"
                          : head >= 0
                            ? "text-desk-go"
                            : "text-desk-nogo"
                      }`}
                    >
                      {head == null ? "—" : `${head >= 0 ? "+" : ""}${usd(head)}`}
                    </td>
                    <td className={`pr-2 font-sans text-xs font-semibold ${confClass(conf)}`}>
                      {conf}
                    </td>
                    <td>
                      <span
                        className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${callChipClass(call)}`}
                      >
                        {call}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="mt-2 text-[10px] text-desk-muted">
            Click a row for detail · ↑/↓ when table focused · Call chips are display-only (VERIFY =
            existing thin/warning flags on a GO)
          </p>
        </div>

        <LotDetailPanel row={selectedRow} sellChannel={sellChannel} targetProfit={targetProfit} />
      </div>

      {walkList.length > 0 && (
        <div className="rounded-lg border border-desk-nogo/30 bg-desk-nogo/5 px-3 py-2">
          <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-desk-nogo">
            Walk list (don&apos;t chase)
          </div>
          <div className="flex flex-wrap gap-1.5">
            {walkList.map((r) => {
              const max = maxBidHammer(r);
              const live = r.currentBid ?? r.nextBid;
              return (
                <button
                  key={r.rowNumber}
                  type="button"
                  onClick={() => setSelected(r.rowNumber)}
                  className="rounded-full border border-desk-nogo/40 bg-desk-panel px-2.5 py-1 text-[11px] text-desk-text hover:border-desk-nogo"
                >
                  <span className="font-semibold">{r.lot}</span>{" "}
                  <span className="text-desk-muted">{r.label.slice(0, 28)}</span>{" "}
                  <span className="text-desk-nogo">
                    live {usd(live)} &gt; max {usd(max)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function Assumption(props: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-desk-border bg-desk-panel px-2.5 py-1">
      <span className="text-desk-muted">{props.label} </span>
      <span className="font-semibold text-desk-text">{props.value}</span>
    </div>
  );
}
