"use client";

import { allInCost } from "@/lib/arbitrage/acquisition";
import { evaluateDeal } from "@/lib/arbitrage/evaluate";
import { heroViable } from "@/lib/arbitrage/verdict";
import type { EvaluationResult, PriceStats } from "@/lib/arbitrage/types";
import type { DealInsights } from "@/lib/deal-insights";
import type { DeskMode } from "@/lib/desk-mode";
import { vendorLabel } from "@/lib/tracked-vendors";
import type { WholesaleGrid } from "@/lib/wholesale";

const usd = (n: number | undefined) =>
  n == null || !Number.isFinite(n) ? "—" : n.toLocaleString("en-US", { style: "currency", currency: "USD" });

export interface AtGlancePanelProps {
  title: string;
  deskMode: DeskMode;
  result: EvaluationResult;
  sold: PriceStats;
  asking: PriceStats;
  wholesale: WholesaleGrid;
  insights: DealInsights | undefined;
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
    liveBid,
    onLiveBidChange,
    buyerPremiumPct,
    inboundShip,
  } = props;

  const isVendor = deskMode.workflow === "vendor";
  const isTradeIn = deskMode.usedSubtype === "tradein";
  const liveHammer = Number(liveBid) || 0;

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

  const heroNumber = isVendor ? null : result.effectiveMaxHammer;
  const heroLabel = isTradeIn ? "MAX OFFER" : "MAX BID";
  const viable = isVendor
    ? liveResult.verdict === "GO"
    : heroViable({ effectiveMaxHammer: result.effectiveMaxHammer, compCount: sold.count });

  const ceiling = result.effectiveMaxHammer;
  const overCeiling =
    !isVendor && liveHammer > 0 && ceiling > 0 && liveHammer > ceiling + 0.01;
  const underCeiling =
    !isVendor && liveHammer > 0 && ceiling > 0 && liveHammer <= ceiling + 0.01;

  const vendorLine = insights?.cheapestInStockDealer;
  const topVendors = insights?.topVendorDeals ?? [];

  return (
    <div className="space-y-3">
      <div
        className={`panel border-2 ${
          viable ? "border-desk-go/50 bg-desk-go/5" : "border-desk-nogo/40 bg-desk-nogo/5"
        }`}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-widest text-desk-muted">At a glance</p>
            <h2 className="text-lg font-bold text-desk-text">{title}</h2>
          </div>
          <span
            className={`rounded-full px-4 py-1.5 text-sm font-black ${
              viable ? "bg-desk-go/20 text-desk-go" : "bg-desk-nogo/20 text-desk-nogo"
            }`}
          >
            {isVendor ? liveResult.verdict : viable ? "BID OK" : "NO ROOM"}
          </span>
        </div>

        {!isVendor && (
          <div className="mt-4">
            <p className="text-xs uppercase tracking-widest text-desk-muted">{heroLabel}</p>
            <p className={`num text-5xl font-black tracking-tight ${viable ? "text-desk-go" : "text-desk-nogo"}`}>
              {sold.count > 0 ? usd(heroNumber ?? undefined) : "—"}
            </p>
            <p className="mt-1 text-sm text-desk-muted">
              Walk-away — do not exceed this {isTradeIn ? "cash offer" : "hammer"}.
            </p>
            {result.profitMaxHammer > result.effectiveMaxHammer + 0.01 && (
              <p className="mt-1 text-xs text-desk-nogo">
                New wholesale cap lowered this from {usd(result.profitMaxHammer)} (profit-only max).
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

        <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-sm">
          {!isVendor && (
            <div>
              <dt className="text-desk-muted">P25 FMV (sold)</dt>
              <dd className="num text-xl font-bold">{sold.count > 0 ? usd(sold.p25) : "—"}</dd>
            </div>
          )}
          {isVendor && (
            <div>
              <dt className="text-desk-muted">Lowest active ask</dt>
              <dd className="num text-xl font-bold">{asking.count > 0 ? usd(asking.low) : "—"}</dd>
            </div>
          )}
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
          {!isVendor && vendorLine && (
            <div>
              <dt className="text-desk-muted">New cap (in stock)</dt>
              <dd className="num text-xl font-bold text-desk-muted">{usd(vendorLine.dealerPrice)}</dd>
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

        {liveResult.verdictReasons.length > 0 && liveResult.verdict === "NO-GO" && (
          <ul className="mt-3 space-y-1 text-xs text-desk-nogo">
            {liveResult.verdictReasons.map((r, i) => (
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
            Type the current auction hammer — updates instantly against your max {isTradeIn ? "offer" : "bid"} (
            {usd(ceiling)}). Leave at 0 until you have a live number.
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
              <span
                className={`rounded px-2 py-1 text-xs font-bold ${
                  liveResult.verdict === "GO" ? "bg-desk-go/20 text-desk-go" : "bg-desk-nogo/20 text-desk-nogo"
                }`}
              >
                {liveResult.verdict} @ {usd(liveHammer)}
              </span>
            )}
          </div>
          {liveHammer > 0 && (
            <p className="mt-2 text-[11px] text-desk-muted">
              All-in at this hammer: {usd(allInCost({ targetAcquisitionCost: liveHammer, buyerPremiumPct, inboundShip }))}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
