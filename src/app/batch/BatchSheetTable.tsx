"use client";

import type { BatchResultRow } from "@/lib/batch/types";
import { usd } from "@/lib/format";
import type { WebEnrichPhase } from "@/lib/web-comps/types";

/** All-in check at a hammer when the row predates allInAtMax* (same BP + card + inbound as the sheet). */
export function payAtHammer(row: BatchResultRow, hammer: number | null | undefined): number | null {
  if (hammer == null) return null;
  const card = Math.max(0, row.purchaseCardPct ?? 0) / 100;
  const inbound =
    row.inboundShip ??
    (row.nextBid != null && row.allInAtNext != null
      ? row.allInAtNext - row.nextBid * (1 + row.buyerPremiumPct / 100) * (1 + card)
      : 0);
  return (
    Math.round((hammer * (1 + row.buyerPremiumPct / 100) * (1 + card) + inbound) * 100) / 100
  );
}

/** Legal max paddle for the active sheet channel (walk-away floored to increment). */
export function maxBidHammer(row: BatchResultRow): number | null {
  return row.walkAwayBid ?? row.walkAway ?? row.maxBid ?? null;
}

/** @deprecated alias — use maxBidHammer */
export function stopHammer(row: BatchResultRow): number | null {
  return maxBidHammer(row);
}

function goTone(v: "GO" | "NO-GO" | null | undefined): string {
  if (v === "GO") return "text-desk-go";
  if (v === "NO-GO") return "text-desk-nogo";
  return "text-desk-muted";
}

function webEnrichBadge(phase: WebEnrichPhase | undefined | null): {
  label: string;
  className: string;
  title: string;
} {
  switch (phase) {
    case "oa":
      return { label: "OA", className: "text-desk-go", title: "Using Outdoor Analytics solds" };
    case "web":
      return {
        label: "Web (advisory)",
        className: "text-desk-accent",
        title: "Street/web asks are advisory only — Max Bid still uses OA solds",
      };
    case "queued":
      return { label: "Queued…", className: "text-desk-warn", title: "Waiting in Tavily drip queue" };
    case "running":
      return { label: "Enriching…", className: "text-desk-warn", title: "Tavily enrich in progress now" };
    case "ready":
      return {
        label: "Ready",
        className: "text-desk-accent",
        title: "High-conf web comps ready — advisory only; Max Bid stays OA solds",
      };
    case "budget":
      return {
        label: "Daily limit",
        className: "text-desk-nogo",
        title: "Web-comps daily limit reached — this row was not looked up",
      };
    case "weak":
      return {
        label: "Weak — final",
        className: "text-desk-muted",
        title: "Enrich finished below confidence. No OA Max Bid.",
      };
    case "skipped":
      return { label: "No OA Comps", className: "text-desk-muted", title: "No OA Comps (No Max Bid)" };
    default:
      return { label: "—", className: "text-desk-muted", title: "" };
  }
}

export function BatchSheetTable(props: {
  rows: BatchResultRow[];
  fullColumns: boolean;
  incrementHint: string | null;
  /** Active sheet exit — labels Max Bid / GO. */
  sellChannel: "gunbroker" | "local";
  /** Target profit used for this sheet run. */
  targetProfit: number;
}) {
  const { rows, fullColumns, incrementHint, sellChannel, targetProfit } = props;
  const channelLabel = sellChannel === "gunbroker" ? "GB" : "Local";

  return (
    <>
      <table className={`w-full text-sm ${fullColumns ? "min-w-[1840px]" : "min-w-[860px]"}`}>
        <thead className="text-left text-xs uppercase text-desk-muted">
          <tr>
            <th className="py-1">Lot</th>
            <th>Item</th>
            <th>Bid?</th>
            {fullColumns ? (
              <>
                <th>Local</th>
                <th>GB</th>
                <th>Trust</th>
              </>
            ) : null}
            <th className="text-right">Sell for (FMV)</th>
            {fullColumns ? (
              <>
                <th className="text-right">Max pay GB</th>
                <th className="text-right">Max pay Local</th>
                <th className="text-right">Current hammer</th>
                <th className="text-right">You pay @ next</th>
                <th className="text-right">You pay @ max GB</th>
              </>
            ) : null}
            <th className="text-right">Next bid</th>
            <th className="text-right">Max bid</th>
            <th className="text-right">OTD @ max</th>
            <th className="text-right">To max</th>
            {fullColumns ? (
              <>
                <th className="text-right">P@$ Local</th>
                <th className="text-right">P@$ GB</th>
                <th className="text-right">Dealer floor</th>
                <th className="text-right">Comps</th>
              </>
            ) : null}
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
            const maxBid = maxBidHammer(r);
            const maxYouPay = payAtHammer(r, maxBid);
            return (
              <tr
                key={r.rowNumber}
                className={`border-t border-desk-border ${r.verdict === "GO" ? "bg-desk-go/5" : ""}`}
              >
                <td className="py-1.5 font-sans">{r.lot}</td>
                <td className="max-w-[280px] font-sans">
                  <div className="truncate" title={r.label}>
                    {r.label}
                    {r.bestDealer && (
                      <span className="ml-1 text-[10px] capitalize text-desk-muted">· {r.bestDealer}</span>
                    )}
                  </div>
                  <div className="whitespace-normal break-words text-[10px] text-desk-muted" title={r.error ?? r.matchNote}>
                    {r.error ? `error: ${r.error}` : r.matchNote || "—"}
                    {!fullColumns && r.soldCount > 0 ? ` · ${r.soldCount} sold` : ""}
                    {r.incrementSource ? ` · ${r.incrementSource}` : ""}
                  </div>
                  {r.newDealerWarning && (
                    <div
                      className="mt-0.5 truncate text-[10px] font-semibold text-desk-nogo"
                      title={r.newDealerWarning}
                    >
                      {r.newDealerWarning}
                    </div>
                  )}
                  {r.matchWarnings?.length > 0 && (
                    <div
                      className="mt-0.5 truncate text-[10px] font-medium text-desk-nogo"
                      title={r.matchWarnings.join(" · ")}
                    >
                      ⚠ {r.matchWarnings[0]}
                      {r.matchWarnings.length > 1 ? ` (+${r.matchWarnings.length - 1})` : ""}
                    </div>
                  )}
                </td>
                <td className="font-sans">
                  {r.error ? (
                    <span className="text-[11px] text-desk-nogo" title={r.error}>
                      err
                    </span>
                  ) : r.verdict == null ? (
                    <span className="text-[11px] text-desk-muted">—</span>
                  ) : (
                    <div>
                      <span className={`font-black ${goTone(r.verdict)}`}>{r.verdict}</span>
                      <div className="text-[10px] text-desk-muted">
                        {channelLabel} · ${Math.round(targetProfit)} profit
                      </div>
                    </div>
                  )}
                </td>
                {fullColumns ? (
                  <>
                    <td>
                      {r.verdictLocal == null ? (
                        <span className="text-[11px] text-desk-muted">—</span>
                      ) : (
                        <span className={`font-sans font-bold ${goTone(r.verdictLocal)}`}>
                          {r.verdictLocal}
                        </span>
                      )}
                    </td>
                    <td>
                      {r.verdictGb == null ? (
                        <span className="text-[11px] text-desk-muted">—</span>
                      ) : (
                        <span className={`font-sans font-bold ${goTone(r.verdictGb)}`}>{r.verdictGb}</span>
                      )}
                    </td>
                    <td className="font-sans">
                      <span className={`text-[11px] font-semibold ${trustClass}`} title={webBadge.title}>
                        {trustLabel}
                      </span>
                    </td>
                  </>
                ) : null}
                <td className="text-right" title={marketNote}>
                  {r.decisionP25 != null ? (
                    <div>
                      <div className="num text-base font-black text-desk-text">{usd(r.decisionP25)}</div>
                      <div className="text-[10px] font-sans text-desk-muted">
                        P25
                        {marketValue != null ? ` · typ ${usd(marketValue)}` : ""}
                        {r.soldCount > 0 ? ` · n=${r.soldCount}` : ""}
                        {r.soldCount > 0 && r.soldCount < 5 ? (
                          <span className="font-semibold text-desk-warn"> · thin</span>
                        ) : null}
                      </div>
                    </div>
                  ) : marketValue != null ? (
                    <div>
                      <div className="num font-semibold text-desk-text">{usd(marketValue)}</div>
                      <div className="text-[10px] font-sans text-desk-muted">
                        typical
                        {r.soldCount > 0 ? ` · n=${r.soldCount}` : ""}
                      </div>
                    </div>
                  ) : (
                    <span className="text-desk-muted">—</span>
                  )}
                </td>
                {fullColumns ? (
                  <>
                    <td className="text-right">{usd(r.maxBidGb)}</td>
                    <td className="text-right">{usd(r.maxBidLocal)}</td>
                    <td className="text-right">{usd(r.currentBid)}</td>
                    <td className="text-right">{usd(r.allInAtNext)}</td>
                    <td className="text-right">{usd(r.allInAtMaxGb ?? payAtHammer(r, r.maxBidGb))}</td>
                  </>
                ) : null}
                <td className="text-right font-semibold">{usd(r.nextBid)}</td>
                <td
                  className={`text-right text-base font-black ${
                    r.verdict === "GO" ? "text-desk-go" : "text-desk-text"
                  }`}
                  title={`Highest legal paddle for ${channelLabel} that still leaves $${targetProfit} profit after fees`}
                >
                  {usd(maxBid)}
                </td>
                <td
                  className="text-right font-semibold"
                  title={`Out-the-door at Max bid: hammer + ${r.buyerPremiumPct}% BP${
                    (r.purchaseCardPct ?? 0) > 0 ? ` + ${r.purchaseCardPct}% card` : ""
                  } + inbound`}
                >
                  {usd(maxYouPay)}
                </td>
                <td
                  className={`text-right font-semibold ${
                    r.headroom == null ? "text-desk-muted" : r.headroom >= 0 ? "text-desk-go" : "text-desk-nogo"
                  }`}
                  title="Paddle dollars left until Max bid — not profit"
                >
                  {r.headroom == null ? "—" : `${r.headroom >= 0 ? "+" : ""}${usd(r.headroom)}`}
                </td>
                {fullColumns ? (
                  <>
                    <td className="text-right">{usd(r.netProfitLocal)}</td>
                    <td className="text-right">{usd(r.netProfitGb)}</td>
                    <td className="text-right">{usd(r.dealerFloor)}</td>
                    <td className="text-right text-desk-muted">{r.soldCount || "—"}</td>
                  </>
                ) : null}
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="mt-3 text-[11px] text-desk-muted">
        {incrementHint ? <span className="text-desk-text">{incrementHint}. </span> : null}
        Sheet exit: <strong className="text-desk-text">{channelLabel}</strong> · profit floor{" "}
        <strong className="text-desk-text">${Math.round(targetProfit)}</strong>.{" "}
        <strong className="text-desk-text">FMV</strong> is OA sold P25.{" "}
        <strong className="text-desk-text">Max bid</strong> is the highest legal paddle for that exit after fees.{" "}
        <strong className="text-desk-text">OTD @ max</strong> is hammer + BP + purchase card + inbound.{" "}
        <strong className="text-desk-text">To max</strong> is paddle room left. Full columns keep both GB/Local
        audit numbers.
      </p>
    </>
  );
}
