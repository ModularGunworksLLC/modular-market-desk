"use client";

import { useState } from "react";

import type { EvaluationResult, PriceStats } from "@/lib/arbitrage/types";
import type { WholesaleGrid } from "@/lib/wholesale";

interface ApiResponse {
  result: EvaluationResult;
  asking: PriceStats;
  wholesale: WholesaleGrid;
  sourceStatus: Record<string, string>;
}

const usd = (n: number | undefined) =>
  n == null ? "-" : n.toLocaleString("en-US", { style: "currency", currency: "USD" });

export default function DeskPage() {
  const [form, setForm] = useState({
    manufacturer: "Glock",
    model: "19",
    upc: "",
    caliber: "9mm",
    targetAcquisitionCost: "400",
    inboundShip: "25",
    buyerPremiumPct: "18",
    outboundShip: "30",
    listingUpgrades: "3",
    targetProfit: "75",
    minMarginPct: "15",
    soldPrices: "650, 700, 720, 750, 780, 800, 850",
  });
  const [data, setData] = useState<ApiResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          manufacturer: form.manufacturer,
          model: form.model,
          upc: form.upc,
          caliber: form.caliber,
          targetAcquisitionCost: Number(form.targetAcquisitionCost),
          inboundShip: Number(form.inboundShip),
          buyerPremiumPct: Number(form.buyerPremiumPct),
          outboundShip: Number(form.outboundShip),
          listingUpgrades: Number(form.listingUpgrades),
          targetProfit: Number(form.targetProfit),
          minMarginPct: Number(form.minMarginPct),
          soldPrices: form.soldPrices
            .split(",")
            .map((s) => Number(s.trim()))
            .filter((n) => Number.isFinite(n) && n > 0),
        }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error?.formErrors?.join(", ") || payload.error || "Request failed");
      setData(payload as ApiResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  const r = data?.result;
  const go = r?.verdict === "GO";

  return (
    <main className="mx-auto max-w-[1800px] px-4 py-6">
      <header className="mb-6 flex items-baseline justify-between">
        <h1 className="text-xl font-semibold tracking-tight">Modular Market Desk</h1>
        <span className="text-xs text-desk-muted">Arbitrage Calculator</span>
      </header>

      {/* Desktop: form left, results right. Mobile: stacked single column. */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[380px_minmax(0,1fr)] 3xl:grid-cols-[420px_minmax(0,1fr)]">
        {/* ---- Buy-side inputs ---- */}
        <form onSubmit={submit} className="panel space-y-3">
          <h2 className="text-sm font-semibold text-desk-muted">The Buy</h2>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Brand" v={form.manufacturer} on={set("manufacturer")} />
            <Field label="Model" v={form.model} on={set("model")} />
            <Field label="UPC" v={form.upc} on={set("upc")} />
            <Field label="Caliber" v={form.caliber} on={set("caliber")} />
            <Field label="Target Cost" v={form.targetAcquisitionCost} on={set("targetAcquisitionCost")} />
            <Field label="Inbound Ship" v={form.inboundShip} on={set("inboundShip")} />
            <Field label="Buyer Premium %" v={form.buyerPremiumPct} on={set("buyerPremiumPct")} />
            <Field label="Outbound Ship" v={form.outboundShip} on={set("outboundShip")} />
            <Field label="Listing Upgrades" v={form.listingUpgrades} on={set("listingUpgrades")} />
            <Field label="Target Profit" v={form.targetProfit} on={set("targetProfit")} />
            <Field label="Min Margin %" v={form.minMarginPct} on={set("minMarginPct")} />
          </div>
          <div>
            <label className="field-label">Sold comps (comma-separated)</label>
            <input className="field-input" value={form.soldPrices} onChange={set("soldPrices")} />
            <p className="mt-1 text-[11px] text-desk-muted">
              Live GunBroker Analytics pull arrives next; for now paste known sold prices.
            </p>
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-desk-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {loading ? "Crunching..." : "Evaluate Deal"}
          </button>
          {error && <p className="text-sm text-desk-nogo">{error}</p>}
        </form>

        {/* ---- Results ---- */}
        <section className="space-y-4">
          {/* Verdict + Max Bid hero */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div
              className={`panel flex flex-col items-center justify-center py-8 ${
                r ? (go ? "border-desk-go" : "border-desk-nogo") : ""
              }`}
            >
              <span className="text-xs uppercase tracking-widest text-desk-muted">Verdict</span>
              <span
                className={`text-5xl font-black tracking-tight 3xl:text-6xl ${
                  r ? (go ? "text-desk-go" : "text-desk-nogo") : "text-desk-muted"
                }`}
              >
                {r?.verdict ?? "—"}
              </span>
            </div>
            <div className="panel flex flex-col items-center justify-center py-8">
              <span className="text-xs uppercase tracking-widest text-desk-muted">Max Bid (hammer)</span>
              <span className="num text-5xl font-black tracking-tight text-desk-text 3xl:text-6xl">
                {usd(r?.maxBid)}
              </span>
            </div>
          </div>

          {r && (
            <>
              <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                <Stat label="All-in Cost" value={usd(r.allInCost)} />
                <Stat label="Net Profit" value={usd(r.netProfit)} tone={r.netProfit >= 0 ? "go" : "nogo"} />
                <Stat label="Margin" value={`${r.marginPct.toFixed(1)}%`} />
                <Stat label="Best Route" value={r.bestRoute === "gunbroker" ? "GunBroker" : "Local AL"} />
              </div>

              {/* Scenario / leakage table */}
              <div className="panel overflow-x-auto">
                <h3 className="mb-2 text-sm font-semibold text-desk-muted">Exit scenarios (per sold percentile)</h3>
                <table className="w-full min-w-[640px] text-sm">
                  <thead className="text-left text-xs uppercase text-desk-muted">
                    <tr>
                      <th className="py-1">Scenario</th>
                      <th>Sell</th>
                      <th>Route A net (GB)</th>
                      <th>Route B net (Local)</th>
                      <th>Best</th>
                      <th>Profit</th>
                      <th>Margin</th>
                      <th>Max Bid</th>
                    </tr>
                  </thead>
                  <tbody className="num">
                    {r.scenarios.map((s) => (
                      <tr key={s.label} className="border-t border-desk-border">
                        <td className="py-1.5 font-sans">{s.label}</td>
                        <td>{usd(s.sellPrice)}</td>
                        <td>{usd(s.routeA.net)}</td>
                        <td>{usd(s.routeB.net)}</td>
                        <td className="font-sans">{s.bestRoute === "gunbroker" ? "GB" : "Local"}</td>
                        <td className={s.netProfit >= 0 ? "text-desk-go" : "text-desk-nogo"}>{usd(s.netProfit)}</td>
                        <td>{s.marginPct.toFixed(1)}%</td>
                        <td>{usd(s.maxBid)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Wholesale grid */}
              <div className="panel overflow-x-auto">
                <h3 className="mb-2 text-sm font-semibold text-desk-muted">
                  Wholesale cross-reference
                  {data?.wholesale.cheaperThanTarget && (
                    <span className="ml-2 rounded bg-desk-warn/20 px-2 py-0.5 text-xs text-desk-warn">
                      Available NEW below your target
                    </span>
                  )}
                </h3>
                {data && data.wholesale.matches.length > 0 ? (
                  <table className="w-full min-w-[560px] text-sm">
                    <thead className="text-left text-xs uppercase text-desk-muted">
                      <tr>
                        <th className="py-1">Distributor</th>
                        <th>Model</th>
                        <th>Dealer Price</th>
                        <th>Stock</th>
                        <th>vs Target</th>
                      </tr>
                    </thead>
                    <tbody className="num">
                      {data.wholesale.matches.map((m, i) => (
                        <tr key={`${m.vendorName}-${i}`} className="border-t border-desk-border">
                          <td className="py-1.5 font-sans capitalize">{m.vendorName}</td>
                          <td className="font-sans">{m.model}</td>
                          <td>{usd(m.dealerPrice)}</td>
                          <td className="font-sans">{m.inStock ? "Yes" : "No"}</td>
                          <td className={m.cheaperThanTarget ? "text-desk-warn" : "text-desk-muted"}>
                            {m.cheaperThanTarget ? "cheaper new" : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className="text-sm text-desk-muted">
                    No distributor catalog matches yet. Import vendor CSVs to populate the grid.
                  </p>
                )}
              </div>
            </>
          )}
        </section>
      </div>
    </main>
  );
}

function Field(props: { label: string; v: string; on: (e: React.ChangeEvent<HTMLInputElement>) => void }) {
  return (
    <div>
      <label className="field-label">{props.label}</label>
      <input className="field-input" value={props.v} onChange={props.on} />
    </div>
  );
}

function Stat(props: { label: string; value: string; tone?: "go" | "nogo" }) {
  return (
    <div className="panel">
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
