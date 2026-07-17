"use client";

import type { ScenarioResult } from "@/lib/arbitrage/types";
import { usd } from "@/lib/format";

export function ExitComparisonPanel(props: {
  chosen: ScenarioResult;
  targetProfit: number;
  verdict: string;
  maxBidGb: number;
  localMaxBid: number;
  profitGb: number;
  localProfit: number;
  profitUpside: number;
  upsideRoute: string;
  allIn: number;
  hammerOverCeiling: boolean;
  enteredHammer: number;
  isAuction: boolean;
  sellChannel: "gunbroker" | "local";
}) {
  const {
    chosen,
    targetProfit,
    verdict,
    maxBidGb,
    localMaxBid,
    profitGb,
    localProfit,
    upsideRoute,
    allIn,
    hammerOverCeiling,
    enteredHammer,
    isAuction,
    sellChannel,
  } = props;
  const useLocal = sellChannel === "local";
  const channelMax = useLocal ? localMaxBid : maxBidGb;
  const channelGo = (useLocal ? localProfit : profitGb) >= targetProfit;
  const go = verdict === "GO";

  return (
    <div className="space-y-3">
      <p className="text-xs text-desk-muted">
        P25 sell {usd(chosen.sellPrice)}. Headline max bid uses{" "}
        <strong className="text-desk-text">{useLocal ? "Local" : "GunBroker"}</strong> fees
        (your selected channel).
      </p>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div
          className={`panel ${!useLocal ? "border-desk-accent/40 bg-desk-accent/5" : "border-desk-border"}`}
        >
          <p
            className={`text-xs font-semibold uppercase tracking-widest ${!useLocal ? "text-desk-accent" : "text-desk-muted"}`}
          >
            GunBroker exit{!useLocal ? " (selected)" : " (alt)"}
          </p>
          <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-desk-muted">Net @ P25</dt>
              <dd className="num font-bold">{usd(chosen.routeA.net)}</dd>
            </div>
            <div>
              <dt className="text-desk-muted">Est. profit</dt>
              <dd className={`num font-bold ${profitGb >= targetProfit ? "text-desk-go" : "text-desk-nogo"}`}>
                {usd(profitGb)}
              </dd>
            </div>
            {isAuction && (
              <div>
                <dt className="text-desk-muted">Max screen bid</dt>
                <dd className="num text-xl font-black">{usd(maxBidGb)}</dd>
              </div>
            )}
            {!useLocal && (
              <div>
                <dt className="text-desk-muted">Verdict</dt>
                <dd className={`text-xl font-black ${go ? "text-desk-go" : "text-desk-nogo"}`}>{verdict}</dd>
              </div>
            )}
          </dl>
          {!useLocal && isAuction && hammerOverCeiling && (
            <p className="mt-2 text-xs font-semibold text-desk-nogo">
              Your hammer {usd(enteredHammer)} is above the channel ceiling {usd(channelMax)}.
            </p>
          )}
        </div>

        <div className={`panel ${useLocal ? "border-desk-accent/40 bg-desk-accent/5" : "border-desk-border"}`}>
          <p
            className={`text-xs font-semibold uppercase tracking-widest ${useLocal ? "text-desk-accent" : "text-desk-muted"}`}
          >
            Local exit{useLocal ? " (selected)" : " (alt)"}
          </p>
          <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-desk-muted">Net @ P25</dt>
              <dd className="num font-bold">{usd(chosen.routeB.net)}</dd>
            </div>
            <div>
              <dt className="text-desk-muted">Est. profit</dt>
              <dd className={`num font-bold ${localProfit >= targetProfit ? "text-desk-go" : "text-desk-text"}`}>
                {usd(localProfit)}
              </dd>
            </div>
            {isAuction && (
              <div>
                <dt className="text-desk-muted">Max screen bid</dt>
                <dd className="num text-xl font-bold">{usd(localMaxBid)}</dd>
              </div>
            )}
            {useLocal && (
              <div>
                <dt className="text-desk-muted">Verdict</dt>
                <dd className={`text-xl font-black ${go ? "text-desk-go" : "text-desk-nogo"}`}>{verdict}</dd>
              </div>
            )}
          </dl>
          <p className="mt-2 text-[11px] text-desk-muted">
            {upsideRoute === "local_al"
              ? "Local nets more at this P25 — useful if you skip listing fees."
              : "GunBroker nets more at this P25 on this gun."}
            {channelGo ? "" : ` Selected channel is below $${targetProfit} target.`}
          </p>
        </div>
      </div>
      <p className="text-[11px] text-desk-muted">
        All-in {usd(allIn)} · Target {usd(targetProfit)} · Bid against the{" "}
        <strong className="text-desk-text">{useLocal ? "Local" : "GunBroker"}</strong> column.
      </p>
    </div>
  );
}

export function Field(props: {
  label: string;
  v: string;
  on: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <div>
      <label className="field-label">{props.label}</label>
      <input className="field-input" value={props.v} onChange={props.on} />
    </div>
  );
}

export function BuyerPaidFeeToggle(props: {
  id: string;
  title: string;
  hint: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label
      htmlFor={props.id}
      className="flex w-full cursor-pointer items-start gap-2.5 border-b border-desk-border/60 pb-2 last:border-0 last:pb-0"
    >
      <input
        id={props.id}
        type="checkbox"
        className="mt-0.5 h-4 w-4 shrink-0 accent-desk-accent"
        checked={props.checked}
        onChange={(e) => props.onChange(e.target.checked)}
      />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium leading-snug text-desk-text">{props.title}</span>
        <span className="mt-0.5 block text-[10px] leading-relaxed text-desk-muted">{props.hint}</span>
      </span>
    </label>
  );
}

export function FieldHint(props: {
  label: string;
  hint: string;
  v: string;
  on: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onBlur?: () => void;
}) {
  return (
    <div>
      <label className="field-label">{props.label}</label>
      <input className="field-input" value={props.v} onChange={props.on} onBlur={props.onBlur} />
      <p className="mt-0.5 text-[10px] leading-snug text-desk-muted">{props.hint}</p>
    </div>
  );
}

export function Stat(props: { label: string; value: string; tone?: "go" | "nogo" }) {
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
