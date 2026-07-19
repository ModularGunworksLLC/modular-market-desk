"use client";

import type { ExitDecision, ScenarioResult } from "@/lib/arbitrage/types";
import { usd } from "@/lib/format";

export function ExitComparisonPanel(props: {
  chosen: ScenarioResult;
  targetProfit: number;
  exits: { gunbroker: ExitDecision; local: ExitDecision };
  allIn: number;
  hammerOverCeiling: boolean;
  enteredHammer: number;
  isAuction: boolean;
  newDealerWarning?: string | null;
}) {
  const {
    chosen,
    targetProfit,
    exits,
    allIn,
    hammerOverCeiling,
    enteredHammer,
    isAuction,
    newDealerWarning,
  } = props;

  const better =
    exits.local.maxBid === exits.gunbroker.maxBid
      ? null
      : exits.local.maxBid > exits.gunbroker.maxBid
        ? "local"
        : "gunbroker";

  return (
    <div className="space-y-3">
      <p className="text-xs text-desk-muted">
        P25 sell {usd(chosen.sellPrice)}. Both exits use the same all-in cost — pick the channel you will
        actually use when you sell.
      </p>
      {newDealerWarning ? (
        <p className="rounded-md border border-desk-nogo/40 bg-desk-nogo/10 px-3 py-2 text-xs font-semibold text-desk-nogo">
          {newDealerWarning}
        </p>
      ) : null}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ExitCard
          title="Local AL exit"
          accent={better === "local"}
          net={chosen.routeB.net}
          exit={exits.local}
          targetProfit={targetProfit}
          isAuction={isAuction}
          hammerOverCeiling={hammerOverCeiling && enteredHammer > exits.local.maxBid + 0.01}
          enteredHammer={enteredHammer}
        />
        <ExitCard
          title="GunBroker exit"
          accent={better === "gunbroker"}
          net={chosen.routeA.net}
          exit={exits.gunbroker}
          targetProfit={targetProfit}
          isAuction={isAuction}
          hammerOverCeiling={hammerOverCeiling && enteredHammer > exits.gunbroker.maxBid + 0.01}
          enteredHammer={enteredHammer}
        />
      </div>
      <p className="text-[11px] text-desk-muted">
        All-in {usd(allIn)} · Target profit {usd(targetProfit)}
        {better === "local"
          ? " · Local allows the higher Max Bid on this gun."
          : better === "gunbroker"
            ? " · GunBroker allows the higher Max Bid on this gun."
            : " · Both exits allow the same Max Bid."}
      </p>
    </div>
  );
}

function ExitCard(props: {
  title: string;
  accent: boolean;
  net: number;
  exit: ExitDecision;
  targetProfit: number;
  isAuction: boolean;
  hammerOverCeiling: boolean;
  enteredHammer: number;
}) {
  const go = props.exit.verdict === "GO";
  return (
    <div
      className={`panel ${
        props.accent ? "border-desk-accent/40 bg-desk-accent/5" : "border-desk-border"
      }`}
    >
      <p
        className={`text-xs font-semibold uppercase tracking-widest ${
          props.accent ? "text-desk-accent" : "text-desk-muted"
        }`}
      >
        {props.title}
        {props.accent ? " · higher ceiling" : ""}
      </p>
      <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-desk-muted">Net @ P25</dt>
          <dd className="num font-bold">{usd(props.net)}</dd>
        </div>
        <div>
          <dt className="text-desk-muted">Est. profit</dt>
          <dd
            className={`num font-bold ${
              props.exit.netProfit >= props.targetProfit ? "text-desk-go" : "text-desk-nogo"
            }`}
          >
            {usd(props.exit.netProfit)}
          </dd>
        </div>
        {props.isAuction && (
          <div>
            <dt className="text-desk-muted">Max Bid</dt>
            <dd className={`num text-xl font-black ${go ? "text-desk-go" : "text-desk-nogo"}`}>
              {usd(props.exit.maxBid)}
            </dd>
          </div>
        )}
        <div>
          <dt className="text-desk-muted">Verdict</dt>
          <dd className={`text-xl font-black ${go ? "text-desk-go" : "text-desk-nogo"}`}>
            {props.exit.verdict}
          </dd>
        </div>
      </dl>
      {props.hammerOverCeiling && (
        <p className="mt-2 text-xs font-semibold text-desk-nogo">
          Your hammer {usd(props.enteredHammer)} is above this channel ceiling{" "}
          {usd(props.exit.maxBid)}.
        </p>
      )}
      {props.exit.profitMaxBid > props.exit.maxBid + 0.01 && (
        <p className="mt-1 text-[11px] text-desk-nogo">
          New wholesale cap lowered from {usd(props.exit.profitMaxBid)}.
        </p>
      )}
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
