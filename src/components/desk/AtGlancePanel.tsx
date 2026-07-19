"use client";

import { allInCost } from "@/lib/arbitrage/acquisition";
import { evaluateDeal } from "@/lib/arbitrage/evaluate";
import { formatNewDealerWarning } from "@/lib/arbitrage/new-floor";
import { heroViable } from "@/lib/arbitrage/verdict";
import type { EvaluationResult, PriceStats } from "@/lib/arbitrage/types";
import type { DealInsights } from "@/lib/deal-insights";
import type { DeskMode } from "@/lib/desk-mode";
import { vendorLabel } from "@/lib/tracked-vendors";
import type { CompFilterMeta, CompMatchTier } from "@/lib/comp-filter";
import { matchTierLabel } from "@/lib/comp-filter";
import { parseMoneyFieldOrZero, usd } from "@/lib/format";
import type { WholesaleGrid } from "@/lib/wholesale";
import type { WebCompsSummary } from "@/lib/web-comps/types";

function matchTierClass(tier: CompMatchTier | undefined): string {
  if (tier === "exact-upc" || tier === "exact-mpn") return "text-desk-go";
  if (tier === "thin") return "text-desk-warn";
  if (tier === "family") return "text-desk-warn";
  return "text-desk-muted";
}

function compsBadge(webComps?: WebCompsSummary | null): { label: string; className: string } {
  if (!webComps || webComps.source === "none") {
    return { label: "Market comps", className: "text-desk-muted" };
  }
  if (webComps.divergence === "cooling") {
    return { label: "Cooling — asks under solds", className: "text-desk-nogo" };
  }
  if (webComps.divergence === "asks_rich") {
    return { label: "Asks rich — solds still rule", className: "text-desk-warn" };
  }
  if (webComps.source === "insufficient") {
    return { label: "Insufficient solds", className: "text-desk-nogo" };
  }
  // OA primary
  if (webComps.agreement === "agrees" || webComps.divergence === "ok") {
    return { label: "OA solds · street OK", className: "text-desk-go" };
  }
  if (webComps.agreement === "web_higher" || webComps.agreement === "web_lower") {
    return { label: "OA solds · street disagrees", className: "text-desk-warn" };
  }
  return { label: "OA solds", className: "text-desk-go" };
}

function liquidityLabel(soldCount: number): { text: string; hot: boolean } {
  if (soldCount >= 40) return { text: "Sells often in this market", hot: true };
  if (soldCount >= 15) return { text: "Moderate sold activity", hot: true };
  if (soldCount >= 5) return { text: "Thin sold sample — be careful near ceiling", hot: false };
  return { text: "Very few sold comps — high uncertainty", hot: false };
}

function shortSourceLine(sourceStatus?: string | null, soldCount?: number, webComps?: WebCompsSummary | null): string {
  if (webComps?.divergence === "cooling" && webComps.median != null) {
    return `Cooling · street asks ~$${Math.round(webComps.median)} under sold FMV`;
  }
  if (webComps?.source === "insufficient") {
    return webComps.note || "No OA solds — street asks advisory only";
  }
  const raw = (sourceStatus ?? "").trim();
  if (!raw) {
    return soldCount != null && soldCount > 0 ? `OA solds · n=${soldCount}` : "Market comps";
  }
  if (/local cache/i.test(raw) || /Local OA/i.test(raw)) {
    const n = soldCount != null ? ` · n=${soldCount}` : "";
    return `OA local solds${n}`;
  }
  if (/live/i.test(raw)) {
    const n = soldCount != null ? ` · n=${soldCount}` : "";
    return `OA live solds${n}`;
  }
  if (raw.length > 90) return `${raw.slice(0, 87)}…`;
  return raw;
}

export interface AtGlancePanelProps {
  title: string;
  deskMode: DeskMode;
  result: EvaluationResult;
  sold: PriceStats;
  asking: PriceStats;
  wholesale: WholesaleGrid;
  insights: DealInsights | undefined;
  compMeta?: CompFilterMeta | null;
  /** e.g. sourceStatus.gba from evaluate response */
  sourceNote?: string | null;
  webComps?: WebCompsSummary | null;
  liveBid: string;
  onLiveBidChange: (v: string) => void;
  buyerPremiumPct: number;
  inboundShip: number;
}

export function AtGlancePanel(props: AtGlancePanelProps) {
  const {
    title,
    deskMode,
    result,
    sold,
    asking,
    wholesale,
    insights,
    compMeta,
    sourceNote,
    webComps,
    liveBid,
    onLiveBidChange,
    buyerPremiumPct,
    inboundShip,
  } = props;

  const isVendor = deskMode.workflow === "vendor";
  const isTradeIn = deskMode.usedSubtype === "tradein";
  const liveHammer = parseMoneyFieldOrZero(liveBid);

  const liveResult = evaluateDeal(
    {
      ...result.input,
      targetAcquisitionCost: isVendor ? result.input.targetAcquisitionCost : liveHammer,
      buyerPremiumPct: isTradeIn ? 0 : buyerPremiumPct,
      inboundShip,
    },
    sold,
    {
      anchorSellPrice: isVendor && asking.count > 0 ? asking.low : undefined,
      decisionAnchor: isVendor ? "low-asking" : "p25-sold",
      dealerFloor: wholesale.cheapestInStockFirearm,
      workflow: deskMode.workflow,
      wholesaleCheaperExists: wholesale.cheaperThanTarget,
      askingCount: asking.count,
      cheapestWholesaleVendor: insights?.cheapestInStockDealer?.vendorName,
      cheapestWholesalePrice: insights?.cheapestInStockDealer?.dealerPrice,
    },
  );

  // Max bids follow live BP/inbound; verdicts need a real hammer (don't treat $0 as GO).
  const ceilingExits = liveResult.exits;
  const verdictExits = liveHammer > 0 ? liveResult.exits : result.exits;
  const heroLabel = isTradeIn ? "MAX OFFER" : "MAX BID";
  const bestCeiling = Math.max(ceilingExits.local.maxBid, ceilingExits.gunbroker.maxBid);
  const viable = isVendor
    ? liveResult.verdict === "GO"
    : heroViable({ effectiveMaxHammer: bestCeiling, compCount: sold.count }) ||
      verdictExits.local.verdict === "GO" ||
      verdictExits.gunbroker.verdict === "GO";

  const ceiling = bestCeiling;
  const liveAllIn = isVendor
    ? result.allInCost
    : allInCost({
        targetAcquisitionCost: liveHammer,
        buyerPremiumPct: isTradeIn ? 0 : buyerPremiumPct,
        inboundShip,
      });
  const dealerVendor = insights?.cheapestInStockDealer
    ? vendorLabel(insights.cheapestInStockDealer.vendorName)
    : null;
  const newDealerWarning = !isVendor
    ? formatNewDealerWarning({
        allInCost: liveHammer > 0 ? liveAllIn : result.allInCost,
        dealerFloor: wholesale.cheapestInStockFirearm,
        vendorLabel: dealerVendor,
      })
    : null;
  const overCeiling =
    !isVendor && liveHammer > 0 && ceiling > 0 && liveHammer > ceiling + 0.01;
  const underCeiling =
    !isVendor && liveHammer > 0 && ceiling > 0 && liveHammer <= ceiling + 0.01;

  /** Near ceiling: within 15% of max bid (or within $75). */
  const nearCeiling =
    !isVendor &&
    liveHammer > 0 &&
    ceiling > 0 &&
    underCeiling &&
    (liveHammer >= ceiling * 0.85 || ceiling - liveHammer <= 75);

  const vendorLine = insights?.cheapestInStockDealer;
  const topVendors = insights?.topVendorDeals ?? [];
  const liq = liquidityLabel(sold.count);
  const trust = shortSourceLine(sourceNote, sold.count, webComps);
  const badge = compsBadge(webComps);
  const matchLabel = compMeta ? matchTierLabel(compMeta.matchTier) : null;

  const goReasons: string[] = [];
  if (!isVendor && viable && sold.count > 0) {
    const goExits = [
      verdictExits.local.verdict === "GO" ? "Local" : null,
      verdictExits.gunbroker.verdict === "GO" ? "GunBroker" : null,
    ].filter(Boolean);
    if (webComps?.divergence === "cooling") {
      goReasons.push(
        `Clears $${result.input.targetProfit} min profit at Cooling-capped P25 (${goExits.join(" + ") || "check exits"}).`,
      );
    } else {
      goReasons.push(
        `Clears $${result.input.targetProfit} min profit at conservative sold P25 on: ${goExits.join(" + ") || "neither exit"}.`,
      );
    }
    if (sold.count < 8) goReasons.push(`Only ${sold.count} sold comps — treat Max Bid as cautious.`);
    else goReasons.push(`${sold.count} sold comps in the decision set.`);
  }
  if (isVendor && liveResult.verdict === "GO" && liveResult.verdictReasons.length === 0) {
    goReasons.push("Cost clears target profit vs lowest active ask.");
  }

  const reasonList = newDealerWarning
    ? [newDealerWarning, ...goReasons]
    : verdictExits.local.verdict === "NO-GO" && verdictExits.gunbroker.verdict === "NO-GO"
      ? [
          ...(verdictExits.local.verdictReasons.length
            ? verdictExits.local.verdictReasons.map((r) => `Local: ${r}`)
            : []),
          ...(verdictExits.gunbroker.verdictReasons.length
            ? verdictExits.gunbroker.verdictReasons.map((r) => `GB: ${r}`)
            : []),
          ...(!isVendor && sold.count === 0 ? ["No sold comps — cannot set a Max Bid."] : []),
        ].slice(0, 6)
      : goReasons;

  const maxBidAllIn =
    !isVendor && ceiling > 0
      ? allInCost({
          targetAcquisitionCost: ceiling,
          buyerPremiumPct: isTradeIn ? 0 : buyerPremiumPct,
          inboundShip,
        })
      : null;

  return (
    <div className="space-y-3">
      <div
        className={`panel border-2 transition-[border-color,background-color] duration-300 ${
          viable ? "border-desk-go/60 bg-desk-go/10" : "border-desk-nogo/50 bg-desk-nogo/10"
        }`}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-widest text-desk-muted">Result</p>
            <h2 className="text-lg font-bold text-desk-text">{title}</h2>
            <p className="mt-1 text-xs text-desk-muted">
              <span className={`font-semibold ${badge.className}`}>{badge.label}</span>
              {" · "}
              {trust}
              {matchLabel ? (
                <>
                  {" · "}
                  <span className={matchTierClass(compMeta?.matchTier)}>{matchLabel}</span>
                </>
              ) : null}
            </p>
            {webComps?.agreement === "web_higher" && (
              <p className="mt-1 text-xs text-desk-warn">
                Street/web asks run above GB solds — Max Bid still uses OA.
              </p>
            )}
            {webComps?.agreement === "web_lower" && (
              <p className="mt-1 text-xs text-desk-nogo">
                Web below OA solds — re-check Make/Model/Caliber. Money still uses OA.
              </p>
            )}
            {webComps?.source === "web" && webComps.sampleDomains.length > 0 && (
              <details className="mt-1 text-xs text-desk-muted">
                <summary className="cursor-pointer">Web sources ({webComps.domainCount} domains)</summary>
                <ul className="mt-1 list-inside list-disc">
                  {webComps.sampleDomains.slice(0, 6).map((d) => (
                    <li key={d}>{d}</li>
                  ))}
                </ul>
              </details>
            )}
          </div>
          <span
            className={`rounded-full px-4 py-1.5 text-sm font-black ${
              viable ? "bg-desk-go/20 text-desk-go" : "bg-desk-nogo/20 text-desk-nogo"
            }`}
          >
            {isVendor ? liveResult.verdict : viable ? "GO" : "NO-GO"}
          </span>
        </div>

        {!isVendor && (
          <div className="mt-4 space-y-3">
            <p className="text-xs uppercase tracking-widest text-desk-muted">
              {heroLabel} — both exits (fees in)
            </p>
            {newDealerWarning ? (
              <p className="rounded-md border border-desk-nogo/40 bg-desk-nogo/15 px-3 py-2 text-xs font-semibold text-desk-nogo">
                {newDealerWarning}
              </p>
            ) : null}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="rounded-md border border-desk-border bg-desk-panel2/80 px-3 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-desk-muted">
                  Local AL
                </p>
                <p
                  className={`num text-4xl font-black tracking-tight ${
                    verdictExits.local.verdict === "GO" ? "text-desk-go" : "text-desk-nogo"
                  }`}
                >
                  {sold.count > 0 ? usd(ceilingExits.local.maxBid) : "—"}
                </p>
                <p
                  className={`mt-1 text-sm font-black ${
                    verdictExits.local.verdict === "GO" ? "text-desk-go" : "text-desk-nogo"
                  }`}
                >
                  {sold.count > 0 ? verdictExits.local.verdict : "—"}
                </p>
                <p className="mt-1 text-[11px] text-desk-muted">
                  Tax-backed local sale · do not exceed this {isTradeIn ? "offer" : "hammer"}
                </p>
              </div>
              <div className="rounded-md border border-desk-border bg-desk-panel2/80 px-3 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-desk-muted">
                  GunBroker
                </p>
                <p
                  className={`num text-4xl font-black tracking-tight ${
                    verdictExits.gunbroker.verdict === "GO" ? "text-desk-go" : "text-desk-nogo"
                  }`}
                >
                  {sold.count > 0 ? usd(ceilingExits.gunbroker.maxBid) : "—"}
                </p>
                <p
                  className={`mt-1 text-sm font-black ${
                    verdictExits.gunbroker.verdict === "GO" ? "text-desk-go" : "text-desk-nogo"
                  }`}
                >
                  {sold.count > 0 ? verdictExits.gunbroker.verdict : "—"}
                </p>
                <p className="mt-1 text-[11px] text-desk-muted">
                  FVF + listing fees baked in · do not exceed this {isTradeIn ? "offer" : "hammer"}
                </p>
              </div>
            </div>
            {sold.count > 0 && sold.median > 0 && (
              <div className="rounded-md border border-desk-accent/40 bg-desk-accent/10 px-3 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-desk-accent">
                  Assessed market value
                </p>
                <p className="num text-3xl font-black text-desk-text">{usd(sold.median)}</p>
                <p className="mt-1 text-xs text-desk-muted">
                  OA sold median · n={sold.count} — before fees. Max Bids above use conservative P25 after
                  fees.
                </p>
              </div>
            )}
            {maxBidAllIn != null && sold.count > 0 && (
              <p className="text-xs text-desk-muted">
                All-in at best Max Bid (premium + inbound): {usd(maxBidAllIn)}
              </p>
            )}
          </div>
        )}

        {isVendor && (
          <div className="mt-4">
            <p className="text-xs uppercase tracking-widest text-desk-muted">Deal check</p>
            <p className={`num text-4xl font-black ${liveResult.verdict === "GO" ? "text-desk-go" : "text-desk-nogo"}`}>
              {liveResult.verdict}
            </p>
            <p className="mt-1 text-sm text-desk-muted">
              Your cost {usd(result.allInCost)} vs lowest ask {usd(asking.low)} → net {usd(liveResult.netProfit)}
            </p>
          </div>
        )}

        {/* Sold band */}
        {!isVendor && sold.count > 0 && (
          <div className="mt-4">
            <p className="text-xs uppercase tracking-widest text-desk-muted">
              {webComps?.source === "web" ? "Web clearing band" : "Sold clearing band"} ({sold.count} comps)
            </p>
            <dl className="mt-2 grid grid-cols-3 gap-2 text-sm">
              <div className="rounded-md border border-desk-border bg-desk-panel2/80 px-2 py-2">
                <dt className="text-[10px] uppercase text-desk-muted">Conservative (P25)</dt>
                <dd className="num text-lg font-bold">{usd(sold.p25)}</dd>
              </div>
              <div className="rounded-md border border-desk-border bg-desk-panel2/80 px-2 py-2">
                <dt className="text-[10px] uppercase text-desk-muted">Typical (median)</dt>
                <dd className="num text-lg font-bold">{usd(sold.median)}</dd>
              </div>
              <div className="rounded-md border border-desk-border bg-desk-panel2/80 px-2 py-2">
                <dt className="text-[10px] uppercase text-desk-muted">Strong (P75)</dt>
                <dd className="num text-lg font-bold">{usd(sold.p75)}</dd>
              </div>
            </dl>
            <p className="mt-2 text-sm text-desk-text">
              At P25 sell: Local net ≈{" "}
              <span className="num font-semibold">{usd(result.chosen.routeB.net)}</span>
              {" · "}
              GB net ≈ <span className="num font-semibold">{usd(result.chosen.routeA.net)}</span>
              <span className="text-desk-muted">
                {" "}
                (profit target ${result.input.targetProfit})
              </span>
            </p>
            <p className={`mt-1 text-xs ${liq.hot ? "text-desk-muted" : "text-desk-warn"}`}>
              {liq.text}
            </p>
          </div>
        )}

        <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 text-sm">
          <div>
            <dt className="text-desk-muted">Target profit</dt>
            <dd className="num text-xl font-bold">{usd(result.input.targetProfit)}</dd>
          </div>
          {vendorLine && (
            <div>
              <dt className="text-desk-muted">Best new (CSV)</dt>
              <dd className="num text-xl font-bold">
                {usd(vendorLine.dealerPrice)}
                <span className="ml-1 font-sans text-xs font-normal capitalize text-desk-muted">
                  {vendorLabel(vendorLine.vendorName)}
                </span>
              </dd>
            </div>
          )}
          {isVendor && (
            <div>
              <dt className="text-desk-muted">Lowest active ask</dt>
              <dd className="num text-xl font-bold">{asking.count > 0 ? usd(asking.low) : "—"}</dd>
            </div>
          )}
        </dl>

        {topVendors.length > 1 && (
          <p className="mt-2 text-xs text-desk-muted">
            Also:{" "}
            {topVendors
              .slice(1)
              .map((v) => `${vendorLabel(v.vendorName)} ${usd(v.dealerPrice)}`)
              .join(" · ")}
          </p>
        )}

        {reasonList.length > 0 && (
          <ul
            className={`mt-3 space-y-1 text-xs ${
              viable ? "text-desk-muted" : "text-desk-nogo"
            }`}
          >
            {reasonList.map((r, i) => (
              <li key={i}>• {r}</li>
            ))}
          </ul>
        )}
      </div>

      {!isVendor && (
        <div className="panel border border-desk-border bg-desk-panel2">
          <label className="field-label" htmlFor="live-bid">
            Check a bid you&apos;re seeing right now
          </label>
          <p className="mb-2 text-[11px] text-desk-muted">
            Type the current auction hammer — updates against your max {isTradeIn ? "offer" : "bid"} (
            {usd(ceiling)}).
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <input
              id="live-bid"
              className="field-input num max-w-[160px] text-lg font-bold"
              inputMode="decimal"
              placeholder="0"
              value={liveBid}
              onChange={(e) => onLiveBidChange(e.target.value)}
            />
            {liveHammer > 0 && ceiling > 0 && (
              <div className="text-sm">
                {overCeiling ? (
                  <span className="font-semibold text-desk-nogo">
                    {usd(liveHammer)} is {usd(liveHammer - ceiling)} over ceiling — stop bidding
                  </span>
                ) : underCeiling ? (
                  <span className="text-desk-go">
                    {usd(liveHammer)} is {usd(ceiling - liveHammer)} under ceiling — est. profit{" "}
                    {usd(liveResult.netProfit)}
                  </span>
                ) : null}
              </div>
            )}
            {liveHammer > 0 && (
              <div className="flex flex-wrap gap-2 text-xs font-bold">
                <span
                  className={`rounded px-2 py-1 ${
                    verdictExits.local.verdict === "GO"
                      ? "bg-desk-go/20 text-desk-go"
                      : "bg-desk-nogo/20 text-desk-nogo"
                  }`}
                >
                  Local {verdictExits.local.verdict}
                </span>
                <span
                  className={`rounded px-2 py-1 ${
                    verdictExits.gunbroker.verdict === "GO"
                      ? "bg-desk-go/20 text-desk-go"
                      : "bg-desk-nogo/20 text-desk-nogo"
                  }`}
                >
                  GB {verdictExits.gunbroker.verdict}
                </span>
              </div>
            )}
          </div>
          {liveHammer > 0 && (
            <p className="mt-2 text-[11px] text-desk-muted">
              All-in at this hammer: {usd(liveAllIn)} · Local profit{" "}
              {usd(verdictExits.local.netProfit)} · GB profit {usd(verdictExits.gunbroker.netProfit)}
            </p>
          )}
          {nearCeiling && (
            <p className={`mt-2 text-xs font-medium ${liq.hot ? "text-desk-go" : "text-desk-warn"}`}>
              Near Max Bid — {liq.text.toLowerCase()}. Use this when debating one more raise.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
