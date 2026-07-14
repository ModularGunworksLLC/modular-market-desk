"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { AtGlancePanel } from "@/components/desk/AtGlancePanel";
import { allInCost } from "@/lib/arbitrage/acquisition";
import { defaultOutboundShip } from "@/lib/arbitrage/shipping";
import { evaluateDeal } from "@/lib/arbitrage/evaluate";
import type { DealInput, DecisionAnchor, EvaluationResult, PriceStats, ScenarioResult } from "@/lib/arbitrage/types";
import type { CompFilterMeta } from "@/lib/comp-filter";
import { matchTierLabel } from "@/lib/comp-filter";
import type { AskingCompRow, SoldCompRow } from "@/lib/gba/client";
import type { OaSelection } from "@/lib/gba/scorer";
import type { DealInsights } from "@/lib/deal-insights";
import { buildDealInsights, DEALER_OPTIONS } from "@/lib/deal-insights";
import type { DeskMode, UsedSubtype, Workflow } from "@/lib/desk-mode";
import { gunBrokerListingUrl } from "@/lib/gunbroker-url";
import type { WholesaleGrid } from "@/lib/wholesale";

const MODE_STORAGE_KEY = "desk-workflow";
const SUBTYPE_STORAGE_KEY = "desk-used-subtype";

interface ApiResponse {
  deskMode?: DeskMode;
  modeId?: string;
  acquisitionMode?: "auction" | "dealer";
  result: EvaluationResult;
  asking: PriceStats;
  wholesale: WholesaleGrid;
  insights?: DealInsights;
  sourceStatus: Record<string, string>;
  catalogMatch?: OaSelection | null;
  soldListings?: SoldCompRow[];
  askingListings?: AskingCompRow[];
  compMeta?: CompFilterMeta | null;
}

const usd = (n: number | undefined) =>
  n == null || !Number.isFinite(n) ? "-" : n.toLocaleString("en-US", { style: "currency", currency: "USD" });

function confidenceLabel(score: number | undefined): string {
  if (score == null) return "—";
  if (score >= 90) return "High confidence";
  if (score >= 75) return "Good match";
  return "Fair match";
}

export default function DeskPage() {
  const [workflow, setWorkflow] = useState<Workflow>("used");
  const [usedSubtype, setUsedSubtype] = useState<UsedSubtype>("auction");
  const [liveBid, setLiveBid] = useState("");
  const [form, setForm] = useState({
    manufacturer: "Glock",
    model: "19",
    upc: "",
    mpn: "",
    caliber: "9mm",
    category: "handgun",
    sourceDealer: "",
    vendorCost: "",
    inboundShip: "",
    buyerPremiumPct: "18",
    outboundShip: "45",
    buyerPaysOutboundShip: true,
    buyerPaysCardFee: true,
    listingUpgrades: "3",
    targetProfit: "50",
    condition: "any",
    soldPrices: "",
    gbaModelId: "",
    gbaCaliberId: "",
  });
  const [data, setData] = useState<ApiResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [vaultOk, setVaultOk] = useState<boolean | null>(null);
  const [vaultMsg, setVaultMsg] = useState<string>("");

  useEffect(() => {
    const saved = localStorage.getItem(MODE_STORAGE_KEY);
    if (saved === "used" || saved === "vendor") setWorkflow(saved);
    const sub = localStorage.getItem(SUBTYPE_STORAGE_KEY);
    if (sub === "auction" || sub === "tradein") setUsedSubtype(sub);
    const legacy = localStorage.getItem("desk-acquisition-mode");
    if (!saved && legacy === "dealer") setWorkflow("vendor");
  }, []);

  function selectWorkflow(w: Workflow) {
    setWorkflow(w);
    localStorage.setItem(MODE_STORAGE_KEY, w);
  }

  function selectUsedSubtype(s: UsedSubtype) {
    setUsedSubtype(s);
    localStorage.setItem(SUBTYPE_STORAGE_KEY, s);
  }

  const deskMode: DeskMode = { workflow, usedSubtype };
  const isVendor = workflow === "vendor";
  const isTradeIn = usedSubtype === "tradein";
  const isUsedAuction = workflow === "used" && usedSubtype === "auction";

  useEffect(() => {
    fetch("/api/vault/status")
      .then((r) => r.json())
      .then((j: { ok?: boolean; message?: string }) => {
        setVaultOk(Boolean(j.ok));
        setVaultMsg(j.message ?? "");
      })
      .catch(() => {
        setVaultOk(false);
        setVaultMsg("Could not check vault status.");
      });
  }, []);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function lookupCatalogUpc(upc: string) {
    const clean = upc.trim();
    if (clean.replace(/\D/g, "").length < 8) return;
    try {
      const res = await fetch(`/api/catalogs/lookup?upc=${encodeURIComponent(clean)}`);
      const j = (await res.json()) as {
        found?: boolean;
        manufacturer?: string;
        model?: string;
        caliber?: string;
        mpn?: string;
      };
      if (!j.found) return;
      setForm((f) => ({
        ...f,
        manufacturer: j.manufacturer || f.manufacturer,
        model: j.model || f.model,
        caliber: j.caliber || f.caliber,
        mpn: j.mpn || f.mpn,
      }));
    } catch {
      /* optional prefill */
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setData(null);
    try {
      const res = await fetch("/api/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workflow,
          usedSubtype,
          sourceDealer: form.sourceDealer || undefined,
          manufacturer: form.manufacturer,
          model: form.model,
          upc: form.upc || undefined,
          mpn: form.mpn || undefined,
          caliber: form.caliber,
          category: form.category,
          condition: isVendor ? "new" : isTradeIn ? "used" : form.condition,
          targetAcquisitionCost: isVendor ? Number(form.vendorCost) || 0 : Number(liveBid) || 0,
          inboundShip: Number(form.inboundShip) || 0,
          buyerPremiumPct: isVendor || isTradeIn ? 0 : Number(form.buyerPremiumPct) || 0,
          outboundShip: Number(form.outboundShip),
          buyerPaysOutboundShip: form.buyerPaysOutboundShip,
          buyerPaysCardFee: form.buyerPaysCardFee,
          listingUpgrades: Number(form.listingUpgrades),
          targetProfit: Number(form.targetProfit),
          minMarginPct: 0,
          autoComps: true,
          ...(form.gbaModelId.trim() && form.gbaCaliberId.trim()
            ? {
                gba: {
                  modelId: Number.parseInt(form.gbaModelId, 10),
                  caliberId: Number.parseInt(form.gbaCaliberId, 10),
                  condition: form.condition === "used" ? "Used" : "New",
                },
              }
            : {}),
          ...(form.soldPrices.trim()
            ? {
                soldPrices: form.soldPrices
                  .split(",")
                  .map((s) => Number(s.trim()))
                  .filter((n) => Number.isFinite(n) && n > 0),
              }
            : {}),
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
  const sold = r?.sold;
  const match = data?.catalogMatch;
  const soldListings = data?.soldListings ?? [];
  const askingListings = data?.askingListings ?? [];
  const title =
    match != null
      ? `${match.manufacturer} ${match.model}${match.caliber ? ` ${match.caliber}` : ""}`
      : `${form.manufacturer} ${form.model}${form.caliber ? ` ${form.caliber}` : ""}`;

  const rangePct =
    sold && sold.high > sold.low
      ? ((sold.p25 - sold.low) / (sold.high - sold.low)) * 100
      : 50;

  const isDealer = isVendor;
  const isAuction = !isVendor;
  const responseDeskMode: DeskMode = data?.deskMode ?? deskMode;

  const insights = useMemo(() => {
    if (!data?.result || !data.wholesale) return undefined;
    const modeId =
      data.modeId ??
      (isVendor ? "vendor" : isTradeIn ? "used-tradein" : "used-auction");
    return buildDealInsights({
      modeId: modeId as "used-auction" | "used-tradein" | "vendor",
      result: data.result,
      sold: data.result.sold,
      asking: data.asking,
      wholesale: data.wholesale,
      sourceDealer: form.sourceDealer || undefined,
    });
  }, [data, form.sourceDealer, isVendor, isTradeIn]);

  const buyerPremiumPct = isVendor || isTradeIn ? 0 : Number(form.buyerPremiumPct) || 0;
  const inboundShipNum = Number(form.inboundShip) || 0;

  const previewInput = {
    targetAcquisitionCost: isVendor ? Number(form.vendorCost) || 0 : Number(liveBid) || 0,
    buyerPremiumPct,
    inboundShip: inboundShipNum,
  };
  const previewAllIn = allInCost(previewInput);
  const enteredHammerOrPrice = previewInput.targetAcquisitionCost;
  const wholesaleRows = insights?.wholesaleRows ?? data?.wholesale.matches ?? [];

  function buildDealInput(): DealInput {
    return {
      targetAcquisitionCost: previewInput.targetAcquisitionCost,
      inboundShip: inboundShipNum,
      buyerPremiumPct,
      outboundShip: Number(form.outboundShip) || 0,
      buyerPaysOutboundShip: form.buyerPaysOutboundShip,
      buyerPaysCardFee: form.buyerPaysCardFee,
      listingUpgrades: Number(form.listingUpgrades) || 0,
      targetProfit: Number(form.targetProfit) || 0,
      minMarginPct: 0,
    };
  }

  const soldForPreview = data?.result?.sold;
  const evalOpts = data
    ? {
        anchorSellPrice:
          isVendor && data.asking.count > 0 ? data.asking.low : undefined,
        decisionAnchor: (isVendor ? "low-asking" : "p25-sold") as DecisionAnchor,
        dealerFloor: data.wholesale.cheapestInStockFirearm,
        workflow: responseDeskMode.workflow,
        wholesaleCheaperExists: data.wholesale.cheaperThanTarget,
        askingCount: data.asking.count,
      }
    : undefined;

  const liveEval =
    soldForPreview && soldForPreview.count > 0 && evalOpts
      ? evaluateDeal(buildDealInput(), soldForPreview, evalOpts)
      : isVendor && data?.asking.count && evalOpts
        ? evaluateDeal(buildDealInput(), soldForPreview ?? { count: 0, low: 0, p25: 0, median: 0, p75: 0, high: 0, avg: 0 }, {
            ...evalOpts,
            anchorSellPrice: data.asking.low,
            decisionAnchor: "low-asking",
          })
        : null;
  const liveProfit = liveEval?.netProfit;
  const liveTarget = liveEval?.input.targetProfit ?? (Number(form.targetProfit) || 0);
  const profitGap =
    liveProfit != null && Number.isFinite(liveProfit) ? liveProfit - liveTarget : null;

  const p25Ceiling = r?.effectiveMaxHammer ?? r?.maxBid;
  const hammerOverCeiling =
    isAuction && p25Ceiling != null && enteredHammerOrPrice > p25Ceiling + 0.01;

  function renderWholesaleBlock() {
    const floor = insights?.cheapestInStock ?? data?.wholesale.cheapestInStockFirearm;
    return (
      <div className="panel overflow-x-auto">
        <h3 className="mb-2 text-sm font-semibold text-desk-muted">
          {isDealer ? "Wholesale — compare your dealer price" : "Wholesale — complete firearms only"}
        </h3>
        {isAuction && data?.wholesale.matchMode === "text" && (
          <p className="mb-2 text-[11px] text-desk-muted">
            Matched by brand / model / caliber (no UPC — normal for auction buys).
          </p>
        )}
        {floor != null && (
          <div className="mb-3 rounded-md border border-desk-accent/30 bg-desk-accent/10 px-3 py-2 text-sm">
            <span className="font-semibold text-desk-accent">
              {isDealer ? "Cheapest in-stock dealer: " : "New dealer floor (in stock): "}
            </span>
            <span className="num font-bold">{usd(floor)}</span>
            {isAuction && data?.wholesale.suggestedHammerCeiling != null && (
              <span className="text-desk-muted">
                {" "}
                — do not outbid new inventory; hammer ceiling ≈ {usd(data.wholesale.suggestedHammerCeiling)} dealer
              </span>
            )}
            {isDealer && r && (
              <span className="text-desk-muted"> — your all-in {usd(r.allInCost)}</span>
            )}
          </div>
        )}
        {data?.sourceStatus?.wholesaleWarning && (
          <p className="mb-2 text-sm text-desk-nogo">{data.sourceStatus.wholesaleWarning}</p>
        )}
        {wholesaleRows.length > 0 ? (
          <table className="w-full min-w-[520px] text-sm">
            <thead className="text-left text-xs uppercase text-desk-muted">
              <tr>
                <th className="py-1">Distributor</th>
                <th>Product</th>
                <th>Dealer</th>
                {isDealer && <th>Save vs you</th>}
                <th>Stock</th>
              </tr>
            </thead>
            <tbody className="num">
              {wholesaleRows.map((m, i) => {
                const row = m as (typeof wholesaleRows)[number] & {
                  savingsVsYourCost?: number | null;
                  isYourSource?: boolean;
                };
                return (
                  <tr
                    key={i}
                    className={`border-t border-desk-border ${
                      row.isYourSource ? "bg-desk-accent/10" : ""
                    }`}
                  >
                    <td className="py-1.5 font-sans capitalize">
                      {m.vendorName}
                      {row.isYourSource && (
                        <span className="ml-1 text-[10px] font-semibold text-desk-accent">(your ad)</span>
                      )}
                    </td>
                    <td className="max-w-[280px] truncate font-sans" title={m.productLabel ?? m.model}>
                      {m.productLabel ?? m.model}
                    </td>
                    <td>{usd(m.dealerPrice)}</td>
                    {isDealer && (
                      <td className={row.savingsVsYourCost != null ? "text-desk-go font-semibold" : "text-desk-muted"}>
                        {row.savingsVsYourCost != null ? usd(row.savingsVsYourCost) : "—"}
                      </td>
                    )}
                    <td className="font-sans">{m.inStock ? "Yes" : "No"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-desk-muted">No distributor rows — import CSVs on /import.</p>
        )}
      </div>
    );
  }

  return (
    <main className="mx-auto max-w-[1800px] px-4 py-6">
      {vaultOk === false && (
        <div className="mb-4 rounded-lg border border-desk-nogo/50 bg-desk-nogo/10 px-4 py-3 text-sm">
          <p className="font-semibold text-desk-nogo">Live comps unavailable</p>
          <p className="mt-1 text-desk-muted">{vaultMsg}</p>
          <p className="mt-2 text-xs text-desk-muted">
            Fix: stop the server, run <code className="text-desk-accent">npm run dev</code>, open{" "}
            <Link href="/import" className="text-desk-accent hover:underline">
              Import
            </Link>
            , re-paste your Bearer token, save, then evaluate again.
          </p>
        </div>
      )}
      {vaultOk === true && (
        <p className="mb-4 text-xs text-desk-go">{vaultMsg}</p>
      )}

      <header className="mb-6 flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-xl font-semibold tracking-tight">Modular Market Desk</h1>
        <nav className="flex items-baseline gap-4 text-xs">
          <Link href="/batch" className="text-desk-accent hover:underline">
            Batch buy-sheet
          </Link>
          <Link href="/deals" className="text-desk-accent hover:underline">
            Wholesale deals
          </Link>
          <Link href="/import" className="text-desk-accent hover:underline">
            Ingestion dashboard
          </Link>
          <span className="text-desk-muted">Arbitrage Calculator</span>
        </nav>
      </header>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[360px_minmax(0,1fr)] 3xl:grid-cols-[400px_minmax(0,1fr)]">
        <form onSubmit={submit} className="panel space-y-3 lg:sticky lg:top-4 lg:self-start">
          <div>
            <h2 className="text-sm font-semibold text-desk-muted">Workflow</h2>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => selectWorkflow("used")}
                className={`rounded-md border px-3 py-2 text-left text-xs transition ${
                  workflow === "used"
                    ? "border-desk-accent bg-desk-accent/15 text-desk-text"
                    : "border-desk-border text-desk-muted hover:border-desk-muted"
                }`}
              >
                <span className="block font-semibold">Used</span>
                <span className="mt-0.5 block text-[10px] opacity-80">Auction or trade-in → max bid / offer</span>
              </button>
              <button
                type="button"
                onClick={() => selectWorkflow("vendor")}
                className={`rounded-md border px-3 py-2 text-left text-xs transition ${
                  isVendor
                    ? "border-desk-accent bg-desk-accent/15 text-desk-text"
                    : "border-desk-border text-desk-muted hover:border-desk-muted"
                }`}
              >
                <span className="block font-semibold">New vendor</span>
                <span className="mt-0.5 block text-[10px] opacity-80">Dealer ad → street vs CSV</span>
              </button>
            </div>
            {workflow === "used" && (
              <div className="mt-2 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => selectUsedSubtype("auction")}
                  className={`rounded-md border px-2 py-1.5 text-xs ${
                    isUsedAuction
                      ? "border-desk-accent bg-desk-accent/10 text-desk-text"
                      : "border-desk-border text-desk-muted"
                  }`}
                >
                  Auction (max bid)
                </button>
                <button
                  type="button"
                  onClick={() => selectUsedSubtype("tradein")}
                  className={`rounded-md border px-2 py-1.5 text-xs ${
                    isTradeIn
                      ? "border-desk-accent bg-desk-accent/10 text-desk-text"
                      : "border-desk-border text-desk-muted"
                  }`}
                >
                  Trade-in (max offer)
                </button>
              </div>
            )}
          </div>
          <h2 className="text-sm font-semibold text-desk-muted">Gun</h2>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Brand" v={form.manufacturer} on={set("manufacturer")} />
            <Field label="Model" v={form.model} on={set("model")} />
            <Field label="Caliber" v={form.caliber} on={set("caliber")} />
            {isVendor && (
              <div className="col-span-2 grid gap-3 sm:grid-cols-2">
                <FieldHint
                  label="UPC"
                  hint="Strongly recommended — tightens comps to your exact SKU."
                  v={form.upc}
                  on={set("upc")}
                  onBlur={() => void lookupCatalogUpc(form.upc)}
                />
                <FieldHint
                  label="MPN / item #"
                  hint="Manufacturer model number (e.g. 3523) — filters wrong variants."
                  v={form.mpn}
                  on={set("mpn")}
                />
              </div>
            )}
            {!isVendor && (
              <details className="col-span-2 text-xs text-desk-muted">
                <summary className="cursor-pointer">UPC / MPN (optional — tightens comps)</summary>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <input
                    className="field-input"
                    value={form.upc}
                    onChange={set("upc")}
                    onBlur={() => void lookupCatalogUpc(form.upc)}
                    placeholder="UPC"
                  />
                  <input
                    className="field-input"
                    value={form.mpn}
                    onChange={set("mpn")}
                    placeholder="MPN / item #"
                  />
                </div>
              </details>
            )}
            <div>
              <label className="field-label">Category</label>
              <select
                className="field-input"
                value={form.category}
                onChange={(e) => {
                  const category = e.target.value;
                  setForm((f) => ({
                    ...f,
                    category,
                    outboundShip: String(defaultOutboundShip(category)),
                  }));
                }}
              >
                <option value="handgun">Handgun</option>
                <option value="rifle">Rifle</option>
                <option value="shotgun">Shotgun</option>
              </select>
            </div>
            {isDealer && (
              <div className="col-span-2">
                <label className="field-label">Source dealer (optional)</label>
                <select
                  className="field-input"
                  value={form.sourceDealer}
                  onChange={(e) => setForm((f) => ({ ...f, sourceDealer: e.target.value }))}
                >
                  <option value="">— not set —</option>
                  {DEALER_OPTIONS.map((d) => (
                    <option key={d.value} value={d.value}>
                      {d.label}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {!isVendor && (
              <div>
                <label className="field-label">Condition (comps)</label>
                <select
                  className="field-input"
                  value={form.condition}
                  onChange={(e) => setForm((f) => ({ ...f, condition: e.target.value }))}
                >
                  <option value="used">Used</option>
                  <option value="any">Any</option>
                </select>
              </div>
            )}
          </div>

          <h2 className="text-sm font-semibold text-desk-muted">
            {isVendor ? "Your dealer cost" : "Acquisition fees"}
          </h2>
          <p className="text-[11px] leading-snug text-desk-muted">
            {isVendor
              ? "Price on the vendor ad — compared to CSV catalogs and lowest active asks."
              : "Buyer’s premium and inbound ship feed the max bid. Check live hammer under the hero after Evaluate."}
          </p>
          <div className="grid grid-cols-2 gap-3">
            {isVendor && (
              <FieldHint
                label="Dealer price ($)"
                hint="What you would pay on this ad."
                v={form.vendorCost}
                on={set("vendorCost")}
              />
            )}
            {isUsedAuction && (
              <FieldHint
                label="Buyer’s premium %"
                hint="Include CC in this number (e.g. 15% + 3.5% = 18.5%)."
                v={form.buyerPremiumPct}
                on={set("buyerPremiumPct")}
              />
            )}
            <FieldHint
              label="Inbound ship ($)"
              hint="Shipping to you — leave blank for $0."
              v={form.inboundShip}
              on={set("inboundShip")}
            />
            {(isVendor || isUsedAuction) && (
              <div className="col-span-2 rounded-md border border-desk-border bg-desk-panel2 px-3 py-2 text-sm">
                <span className="text-desk-muted">Your all-in cost </span>
                <span className="num font-bold text-desk-text">{usd(previewAllIn)}</span>
              </div>
            )}
          </div>

          <h2 className="text-sm font-semibold text-desk-muted">If you sell (exit assumptions)</h2>
          <p className="text-[11px] leading-snug text-desk-muted">
            GunBroker route only. Checkboxes reflect what the <strong className="text-desk-text">buyer</strong> pays
            — when checked, that cost is not deducted from your net or max screen bid.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <FieldHint
              label="Outbound ship on listing ($)"
              hint="Shipping charge shown on the listing (buyer pays if checked below)."
              v={form.outboundShip}
              on={set("outboundShip")}
            />
            <FieldHint
              label="Listing upgrades ($)"
              hint="Your GunBroker listing fee (always deducted from net)."
              v={form.listingUpgrades}
              on={set("listingUpgrades")}
            />
          </div>
          <div className="flex flex-col gap-2 rounded-md border border-desk-border bg-desk-panel2 p-3">
            <BuyerPaidFeeToggle
              id="buyer-pays-ship"
              title="Buyer pays outbound shipping"
              hint="Shipping is not deducted from net or max screen bid."
              checked={form.buyerPaysOutboundShip}
              onChange={(checked) =>
                setForm((f) => ({ ...f, buyerPaysOutboundShip: checked }))
              }
            />
            <BuyerPaidFeeToggle
              id="buyer-pays-card"
              title="Buyer pays card processing"
              hint="3% on item + ship is not deducted from your net."
              checked={form.buyerPaysCardFee}
              onChange={(checked) => setForm((f) => ({ ...f, buyerPaysCardFee: checked }))}
            />
          </div>

          <h2 className="text-sm font-semibold text-desk-muted">Deal rules (GO / NO-GO)</h2>
          <p className="text-[11px] leading-snug text-desk-muted">
            GO when <strong className="text-desk-text">GunBroker profit @ P25</strong> ≥ target (conservative).
            Local profit shown for comparison.
          </p>
          <FieldHint
            label="Target profit ($)"
            hint="Minimum dollars you want to keep after exit fees at P25 market (default $50)."
            v={form.targetProfit}
            on={set("targetProfit")}
          />

          {liveEval && soldForPreview && soldForPreview.count > 0 ? (
            <LiveProfitBox
              profit={liveProfit!}
              localProfit={liveEval.localNetProfit}
              target={liveTarget}
              gap={profitGap!}
              go={liveEval.verdict === "GO"}
              exitLabel="GunBroker @ P25"
            />
          ) : (
            <p className="text-[11px] text-desk-muted">Run Evaluate to see live est. profit at P25.</p>
          )}
          <details className="text-xs text-desk-muted">
            <summary className="cursor-pointer">OA catalog IDs (from hub console)</summary>
            <p className="mt-1 text-[11px]">
              On the OA pricing page, F12 → Console shows{" "}
              <code className="text-desk-accent">modelID</code> and <code className="text-desk-accent">caliberID</code>{" "}
              when you pick a gun. Paste them here if auto-match fails.
            </p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <Field label="Model ID" v={form.gbaModelId} on={set("gbaModelId")} />
              <Field label="Caliber ID" v={form.gbaCaliberId} on={set("gbaCaliberId")} />
            </div>
          </details>
          <details className="text-xs text-desk-muted">
            <summary className="cursor-pointer">Manual sold override (optional)</summary>
            <input
              className="field-input mt-2"
              value={form.soldPrices}
              onChange={set("soldPrices")}
              placeholder="Only if live pull fails"
            />
          </details>
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-desk-accent px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            {loading ? "Pulling live comps…" : "Evaluate Deal"}
          </button>
          {loading && (
            <p className="text-center text-xs text-desk-muted">
              Loading OA catalog + live comps. First run after restart can take 1–3 minutes — do not refresh.
            </p>
          )}
          {error && <p className="text-sm text-desk-nogo">{error}</p>}
        </form>

        <section className="space-y-4">
          {!data && !loading && (
            <div className="panel py-12 text-center text-sm text-desk-muted">
              Enter a gun on the left and click <strong className="text-desk-text">Evaluate Deal</strong>. Live
              comps load from GunBroker Analytics (first run may take 1–3 minutes).
            </div>
          )}

          {data && (
          <>
          {r && (isVendor || (sold && sold.count > 0)) && (
            <AtGlancePanel
              title={title}
              deskMode={responseDeskMode}
              result={r}
              sold={sold ?? r.sold}
              asking={data.asking}
              wholesale={data.wholesale}
              insights={insights}
              compMeta={data.compMeta}
              liveBid={liveBid}
              onLiveBidChange={setLiveBid}
              buyerPremiumPct={buyerPremiumPct}
              inboundShip={inboundShipNum}
            />
          )}

          {isVendor && insights && insights.headlines.length > 0 && (
            <div className="panel space-y-2 border-desk-accent/35 bg-desk-accent/5">
              <p className="text-xs font-medium uppercase tracking-widest text-desk-accent">Dealer buy — decision summary</p>
              <ul className="space-y-1.5 text-sm text-desk-text">
                {insights.headlines.map((line, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="text-desk-accent">•</span>
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
              {insights.marketTooSoft && (
                <p className="text-xs font-semibold text-desk-nogo">
                  Caution: open asking comps sit close to your all-in cost.
                </p>
              )}
            </div>
          )}

          {isDealer && renderWholesaleBlock()}

          {/* OA-style market comps (primary) */}
          <div className="comp-hero space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-xs font-medium uppercase tracking-widest text-desk-muted">Market comps</p>
                <h2 className="text-lg font-bold text-desk-text">{title}</h2>
                {data?.sourceStatus?.gba && (
                  <p className="mt-1 text-xs text-desk-muted">{data.sourceStatus.gba}</p>
                )}
              </div>
              {match && (
                <span className="rounded-full border border-desk-border bg-desk-panel2 px-3 py-1 text-xs text-desk-muted">
                  {confidenceLabel(match.score)} · score {match.score.toFixed(0)}
                </span>
              )}
              {data?.compMeta && (
                <span
                  className={`rounded-full border px-3 py-1 text-xs ${
                    data.compMeta.matchTier === "exact-upc" || data.compMeta.matchTier === "exact-mpn"
                      ? "border-desk-go/40 bg-desk-go/10 text-desk-go"
                      : "border-desk-nogo/40 bg-desk-nogo/10 text-desk-nogo"
                  }`}
                >
                  {matchTierLabel(data.compMeta.matchTier)}
                </span>
              )}
            </div>

            {sold && sold.count > 0 ? (
              <>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div>
                    <p className="text-xs uppercase tracking-widest text-desk-accent">Target price (P25 sold)</p>
                    <p className="comp-fmv num">{usd(sold.p25)}</p>
                    <p className="text-xs text-desk-muted">
                      Conservative anchor · median {usd(sold.median)}
                    </p>
                  </div>
                  <div className="rounded-md border border-desk-border bg-desk-panel/60 p-3">
                    <p className="text-xs uppercase text-desk-muted">Typical market (median sold)</p>
                    <p className="num text-2xl font-bold">{usd(sold.median)}</p>
                    <p className="mt-2 text-xs text-desk-muted">
                      P75 {usd(sold.p75)} · band {usd(sold.p25)}–{usd(sold.median)}
                    </p>
                  </div>
                  <div className="rounded-md border border-desk-border bg-desk-panel/60 p-3">
                    <p className="text-xs uppercase text-desk-muted">Cleaned sample</p>
                    <p className="num text-2xl font-bold">{sold.count}</p>
                    <p className="text-xs text-desk-muted">
                      {data?.compMeta
                        ? `${data.compMeta.soldOutliersRemoved} high/low outliers removed`
                        : `Low ${usd(sold.low)} · High ${usd(sold.high)}`}
                    </p>
                    <p className="mt-2 text-xs text-desk-muted">
                      Asking median (complete guns) {usd(data?.asking?.median)}
                    </p>
                  </div>
                </div>
                {data?.compMeta && (
                  <p className="text-xs text-desk-muted">
                    {data.compMeta.decisionNote}
                    {data.compMeta.enrichNotes.length > 0 && (
                      <span className="block mt-1">{data.compMeta.enrichNotes.join(" ")}</span>
                    )}
                  </p>
                )}
                <p className="text-[11px] text-desk-muted">
                  GunBroker sold comps (cleaned). Official numbers use{" "}
                  <strong className="text-desk-text">P25 sell + GunBroker exit</strong> (conservative).
                </p>
                <div>
                  <p className="mb-1 text-xs text-desk-muted">Price distribution (sold)</p>
                  <div className="comp-range-track">
                    <div
                      className="comp-range-fill"
                      style={{ left: "0%", width: `${Math.max(8, sold.p75 - sold.low > 0 ? ((sold.p75 - sold.low) / (sold.high - sold.low)) * 100 : 100)}%` }}
                    />
                    <div className="comp-range-marker" style={{ left: `${Math.min(96, Math.max(2, rangePct))}%` }} />
                  </div>
                  <div className="mt-1 flex justify-between text-[10px] text-desk-muted num">
                    <span>{usd(sold.low)}</span>
                    <span>{usd(sold.high)}</span>
                  </div>
                </div>
              </>
            ) : (
              <div className="rounded-md border border-desk-nogo/40 bg-desk-nogo/10 p-4 text-sm">
                <p className="font-semibold text-desk-nogo">No live sold comps loaded</p>
                <p className="mt-1 text-desk-muted">
                  {data?.sourceStatus?.gba ??
                    "Run Evaluate with a saved token on Import → Connections."}
                </p>
                <p className="mt-2 text-xs text-desk-muted">
                  For guns that won&apos;t auto-match (e.g. Savage 1911): on{" "}
                  <strong>hub.outdooranalytics.com/pricing</strong>, select the gun, open Console, copy{" "}
                  <strong>modelID</strong> and <strong>caliberID</strong>, paste under &quot;OA catalog IDs&quot; on
                  the left, then evaluate again.
                </p>
              </div>
            )}
          </div>

          {/* TGV-style recent sold */}
          {soldListings.length > 0 && (
            <div className="panel overflow-x-auto">
              <h3 className="mb-2 text-sm font-semibold text-desk-muted">
                Complete-gun sold comps (P25–median band) — {soldListings.length} shown
              </h3>
              {data?.compMeta && data.compMeta.soldNonFirearmRemoved > 0 && (
                <p className="mb-2 text-[11px] text-desk-muted">
                  Excluded {data.compMeta.soldNonFirearmRemoved} sold rows (parts, mags, or below gun price floor).
                </p>
              )}
              <table className="w-full min-w-[520px] text-sm">
                <thead className="text-left text-xs uppercase text-desk-muted">
                  <tr>
                    <th className="py-1">Price</th>
                    {soldListings.some((r) => r.title) && <th>Title</th>}
                    <th>Sold</th>
                    <th>Type</th>
                  </tr>
                </thead>
                <tbody className="num">
                  {soldListings.map((row, i) => (
                    <tr key={i} className="border-t border-desk-border">
                      <td className="py-1.5 font-semibold text-desk-text">{usd(row.price)}</td>
                      {soldListings.some((r) => r.title) && (
                        <td className="max-w-[280px] truncate font-sans text-desk-muted" title={row.title}>
                          {row.title || "—"}
                        </td>
                      )}
                      <td className="font-sans text-desk-muted">{row.salesDate || "—"}</td>
                      <td className="font-sans text-desk-muted">{row.listingType || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {askingListings.length > 0 && (
            <div className="panel overflow-x-auto">
              <h3 className="mb-2 text-sm font-semibold text-desk-muted">
                Active asking — complete guns only ({askingListings.length})
              </h3>
              {data?.compMeta && data.compMeta.askingIncompleteRemoved > 0 && (
                <p className="mb-2 text-[11px] text-desk-muted">
                  Excluded {data.compMeta.askingIncompleteRemoved} asking rows (parts, receivers, mags, or junk).
                </p>
              )}
              <table className="w-full min-w-[640px] text-sm">
                <thead className="text-left text-xs uppercase text-desk-muted">
                  <tr>
                    <th className="py-1">Price</th>
                    <th>Title</th>
                    <th>Location</th>
                  </tr>
                </thead>
                <tbody>
                  {askingListings.map((row, i) => (
                    <tr key={i} className="border-t border-desk-border">
                      <td className="num py-1.5 font-semibold">{usd(row.price)}</td>
                      <td className="max-w-[320px] truncate font-sans">
                        {(() => {
                          const listingUrl = gunBrokerListingUrl(row.itemId);
                          return listingUrl ? (
                            <a
                              href={listingUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-desk-accent hover:underline"
                              title={row.title || undefined}
                            >
                              {row.title || `Item ${row.itemId}`}
                            </a>
                          ) : (
                            row.title || "—"
                          );
                        })()}
                      </td>
                      <td className="font-sans text-desk-muted">{row.location || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {liveEval && soldForPreview && soldForPreview.count > 0 && (
            <LiveProfitBox
              profit={liveProfit!}
              localProfit={liveEval.localNetProfit}
              target={liveTarget}
              gap={profitGap!}
              go={liveEval.verdict === "GO"}
              exitLabel="GunBroker @ P25"
              large
            />
          )}

          {r && sold && sold.count > 0 && (
            <ExitComparisonPanel
              chosen={r.chosen}
              targetProfit={r.input.targetProfit}
              verdict={r.verdict}
              maxBidGb={r.maxBid}
              localMaxBid={r.localMaxBid}
              profitGb={r.netProfit}
              localProfit={r.localNetProfit}
              profitUpside={r.profitUpside}
              upsideRoute={r.upsideRoute}
              allIn={r.allInCost}
              hammerOverCeiling={hammerOverCeiling}
              enteredHammer={enteredHammerOrPrice}
              isAuction={isAuction}
            />
          )}

          {r && (
            <>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <Stat label="Your all-in (OTD)" value={usd(r.allInCost)} />
                <Stat
                  label="Profit (GB @ P25)"
                  value={sold && sold.count > 0 ? usd(r.netProfit) : "—"}
                  tone={
                    sold && sold.count > 0
                      ? r.netProfit >= r.input.targetProfit
                        ? "go"
                        : "nogo"
                      : undefined
                  }
                />
                <Stat
                  label="Profit (Local @ P25)"
                  value={sold && sold.count > 0 ? usd(r.localNetProfit) : "—"}
                  tone={sold && sold.count > 0 ? "go" : undefined}
                />
                <Stat
                  label="Local upside"
                  value={
                    sold && sold.count > 0 && r.profitUpside > 0
                      ? `+${usd(r.profitUpside)}`
                      : "—"
                  }
                />
              </div>

              {isAuction && r && sold && sold.count > 0 && (
                <>
                  <MaxBidWaterfall chosen={r.chosen} input={r.input} />
                  <LocalExitSummary chosen={r.chosen} input={r.input} />
                </>
              )}

              {sold && sold.count > 0 && (
              <div className="panel overflow-x-auto">
                <h3 className="mb-1 text-sm font-semibold text-desk-muted">Exit scenarios</h3>
                <p className="mb-3 text-[11px] text-desk-muted">
                  Each row uses your all-in {usd(r.allInCost)}.{" "}
                  <strong className="text-desk-text">GB profit / max bid</strong> are official (conservative).{" "}
                  Local columns show upside if you sell face-to-face.
                </p>
                <table className="w-full min-w-[880px] text-sm">
                  <thead className="text-left text-xs uppercase text-desk-muted">
                    <tr>
                      <th className="py-1">If market clears at</th>
                      <th>Sell price</th>
                      <th>GB net</th>
                      <th>Local net</th>
                      <th>GB profit</th>
                      <th>Local profit</th>
                      <th>GB max bid</th>
                      <th>Local max bid</th>
                    </tr>
                  </thead>
                  <tbody className="num">
                    {r.scenarios.map((s) => (
                      <tr
                        key={s.label}
                        className={`border-t border-desk-border ${
                          s.label === "P25" ? "bg-desk-accent/5" : ""
                        }`}
                      >
                        <td className="py-1.5 font-sans font-medium">{s.label}</td>
                        <td>{usd(s.sellPrice)}</td>
                        <td>{usd(s.routeA.net)}</td>
                        <td>{usd(s.routeB.net)}</td>
                        <td className={s.netProfit >= 0 ? "text-desk-go" : "text-desk-nogo"}>{usd(s.netProfit)}</td>
                        <td className={s.localProfit >= 0 ? "text-desk-go" : "text-desk-nogo"}>
                          {usd(s.localProfit)}
                        </td>
                        <td className="font-semibold">{usd(s.maxBid)}</td>
                        <td className="text-desk-muted">{usd(s.localMaxBid)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              )}

              {isAuction && renderWholesaleBlock()}
            </>
          )}
          </>
          )}
        </section>
      </div>
    </main>
  );
}

function BestDealerTile(props: {
  dealer: { vendorName: string; productLabel: string; dealerPrice: number };
  yourAllIn: number;
  enteredHammer: number;
  maxBid: number | undefined;
}) {
  const { dealer, yourAllIn, enteredHammer, maxBid } = props;
  // The new in-stock dealer price is a hard ceiling: never hammer above it.
  const overFloor = yourAllIn > dealer.dealerPrice + 0.01;
  return (
    <div
      className={`panel ${
        overFloor ? "border-desk-nogo/45 bg-desk-nogo/10" : "border-desk-accent/40 bg-desk-accent/5"
      }`}
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-desk-accent">
            Best new-in-stock dealer
          </p>
          <p className="mt-1 text-sm font-semibold capitalize text-desk-text">
            {dealer.vendorName}
            <span className="ml-2 font-sans text-xs font-normal text-desk-muted" title={dealer.productLabel}>
              {dealer.productLabel}
            </span>
          </p>
        </div>
        <div className="text-right">
          <p className="text-[10px] uppercase tracking-widest text-desk-muted">Dealer floor / hammer ceiling</p>
          <p className="num text-3xl font-black text-desk-text">{usd(dealer.dealerPrice)}</p>
        </div>
      </div>
      <p className={`mt-2 text-xs ${overFloor ? "font-semibold text-desk-nogo" : "text-desk-muted"}`}>
        {overFloor ? (
          <>
            Do not bid here — your all-in {usd(yourAllIn)} already beats buying new from {dealer.vendorName} at{" "}
            {usd(dealer.dealerPrice)}. You&apos;d overpay by {usd(yourAllIn - dealer.dealerPrice)}.
          </>
        ) : (
          <>
            You can buy this new from {dealer.vendorName} for {usd(dealer.dealerPrice)} — never let the hammer
            (all-in) climb past that. Your all-in is {usd(yourAllIn)}.
          </>
        )}
      </p>
      {maxBid != null && Number.isFinite(maxBid) && (
        <p className="mt-1 text-[11px] text-desk-muted">
          Profit-based max screen bid is {usd(maxBid)}; treat the lower of that and the {usd(dealer.dealerPrice)}{" "}
          dealer floor as your true walk-away.
        </p>
      )}
    </div>
  );
}

function ExitComparisonPanel(props: {
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
}) {
  const {
    chosen,
    targetProfit,
    verdict,
    maxBidGb,
    localMaxBid,
    profitGb,
    localProfit,
    profitUpside,
    upsideRoute,
    allIn,
    hammerOverCeiling,
    enteredHammer,
    isAuction,
  } = props;
  const go = verdict === "GO";
  const localGo = localProfit >= targetProfit;

  return (
    <div className="space-y-3">
      <p className="text-xs text-desk-muted">
        P25 sell price {usd(chosen.sellPrice)} from GunBroker sold comps. Official bid ceiling uses{" "}
        <strong className="text-desk-text">GunBroker fees</strong> (conservative).
      </p>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="panel border-desk-accent/40 bg-desk-accent/5">
          <p className="text-xs font-semibold uppercase tracking-widest text-desk-accent">
            GunBroker exit (official)
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
            <div>
              <dt className="text-desk-muted">Verdict</dt>
              <dd className={`text-xl font-black ${go ? "text-desk-go" : "text-desk-nogo"}`}>{verdict}</dd>
            </div>
          </dl>
          {isAuction && hammerOverCeiling && (
            <p className="mt-2 text-xs font-semibold text-desk-nogo">
              Your hammer {usd(enteredHammer)} is above the GB ceiling {usd(maxBidGb)}.
            </p>
          )}
        </div>

        <div className="panel">
          <p className="text-xs font-semibold uppercase tracking-widest text-desk-muted">
            Local AL exit (comparison)
          </p>
          <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-desk-muted">Net @ P25</dt>
              <dd className="num font-bold">{usd(chosen.routeB.net)}</dd>
            </div>
            <div>
              <dt className="text-desk-muted">Est. profit</dt>
              <dd className={`num font-bold ${localGo ? "text-desk-go" : "text-desk-text"}`}>
                {usd(localProfit)}
              </dd>
            </div>
            {isAuction && (
              <div>
                <dt className="text-desk-muted">Max screen bid</dt>
                <dd className="num text-xl font-bold text-desk-muted">{usd(localMaxBid)}</dd>
              </div>
            )}
            <div>
              <dt className="text-desk-muted">vs GunBroker</dt>
              <dd className="num font-semibold text-desk-go">
                {profitUpside > 0 ? `+${usd(profitUpside)} profit` : "—"}
              </dd>
            </div>
          </dl>
          <p className="mt-2 text-[11px] text-desk-muted">
            {upsideRoute === "local_al"
              ? "Local nets more at this P25 price — optional upside if you skip GunBroker fees."
              : "GunBroker nets more at this P25 price on this gun."}
          </p>
        </div>
      </div>
      <p className="text-[11px] text-desk-muted">
        All-in {usd(allIn)} · Target profit {usd(targetProfit)} · Use GB column for bidding; compare local before
        choosing meet-up vs listing.
      </p>
    </div>
  );
}

function MaxBidWaterfall({ chosen, input }: { chosen: ScenarioResult; input: EvaluationResult["input"] }) {
  const route = chosen.routeA;
  const gbNet = route.net;
  const shipLeak = input.buyerPaysOutboundShip ? 0 : route.outboundShip;
  const cardLeak = input.buyerPaysCardFee ? 0 : route.cardFee;
  const steps: { label: string; value: number; tone?: "pos" | "neg" | "muted" }[] = [
    { label: "P25 sell price (market anchor)", value: chosen.sellPrice },
    { label: "Final value fee", value: -route.finalValueFee, tone: "neg" },
    { label: "Master FFL fee", value: -route.masterFflFee, tone: "neg" },
    {
      label: input.buyerPaysOutboundShip
        ? `Outbound shipping ($${route.outboundShip.toFixed(0)} — buyer pays)`
        : "Outbound shipping",
      value: -shipLeak,
      tone: shipLeak > 0 ? "neg" : "muted",
    },
    {
      label: input.buyerPaysCardFee
        ? `Card processing (${usd(route.cardFee)} — buyer pays)`
        : "Card processing (3%)",
      value: -cardLeak,
      tone: cardLeak > 0 ? "neg" : "muted",
    },
    { label: "Listing upgrades", value: -route.listingUpgrades, tone: "neg" },
    { label: "Net proceeds (GunBroker)", value: gbNet, tone: "pos" },
    { label: `Target profit ($${input.targetProfit})`, value: -input.targetProfit, tone: "neg" },
    { label: "Max all-in (premium + inbound back-solved)", value: gbNet - input.targetProfit, tone: "pos" },
    { label: "→ Max screen bid (GB ceiling)", value: chosen.maxBid, tone: "pos" },
  ];

  return (
    <div className="panel overflow-x-auto">
      <h3 className="mb-2 text-sm font-semibold text-desk-muted">
        Max screen bid — GunBroker @ P25 (conservative)
      </h3>
      <table className="w-full min-w-[400px] text-sm">
        <tbody>
          {steps.map((s) => (
            <tr key={s.label} className="border-t border-desk-border first:border-t-0">
              <td className="py-1.5 font-sans text-desk-muted">{s.label}</td>
              <td
                className={`num py-1.5 text-right font-semibold ${
                  s.tone === "neg"
                    ? "text-desk-nogo"
                    : s.tone === "pos"
                      ? "text-desk-go"
                      : s.tone === "muted"
                        ? "text-desk-muted"
                        : ""
                }`}
              >
                {s.tone === "muted" ? "$0" : s.value < 0 ? `−${usd(Math.abs(s.value))}` : usd(s.value)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-[11px] text-desk-muted">
        Hammer backs out buyer&apos;s premium ({input.buyerPremiumPct}%) and inbound ship ({usd(input.inboundShip)}).
        Official ceiling uses GunBroker fees at P25. Premium {input.buyerPremiumPct}%, inbound{" "}
        {usd(input.inboundShip)}.
      </p>
    </div>
  );
}

function LocalExitSummary({ chosen, input }: { chosen: ScenarioResult; input: EvaluationResult["input"] }) {
  const route = chosen.routeB;
  return (
    <div className="panel text-sm">
      <h3 className="mb-2 text-sm font-semibold text-desk-muted">Local AL @ P25 (comparison)</h3>
      <table className="w-full min-w-[320px]">
        <tbody className="num">
          <tr className="border-t border-desk-border first:border-t-0">
            <td className="py-1.5 font-sans text-desk-muted">P25 sell price</td>
            <td className="py-1.5 text-right font-semibold">{usd(chosen.sellPrice)}</td>
          </tr>
          <tr className="border-t border-desk-border">
            <td className="py-1.5 font-sans text-desk-muted">AL tax absorbed</td>
            <td className="py-1.5 text-right text-desk-nogo">−{usd(route.taxAbsorbed)}</td>
          </tr>
          <tr className="border-t border-desk-border">
            <td className="py-1.5 font-sans text-desk-muted">Net proceeds (local)</td>
            <td className="py-1.5 text-right font-semibold text-desk-go">{usd(route.net)}</td>
          </tr>
          <tr className="border-t border-desk-border">
            <td className="py-1.5 font-sans text-desk-muted">Est. profit</td>
            <td className="py-1.5 text-right font-semibold">{usd(chosen.localProfit)}</td>
          </tr>
          <tr className="border-t border-desk-border">
            <td className="py-1.5 font-sans text-desk-muted">Max screen bid (if selling local)</td>
            <td className="py-1.5 text-right">{usd(chosen.localMaxBid)}</td>
          </tr>
        </tbody>
      </table>
      {chosen.profitUpside > 0 && (
        <p className="mt-2 text-xs text-desk-go">
          +{usd(chosen.profitUpside)} more profit vs GunBroker at P25 — do not use this for conservative bidding.
        </p>
      )}
    </div>
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

function BuyerPaidFeeToggle(props: {
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

function FieldHint(props: {
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

function LiveProfitBox(props: {
  profit: number;
  localProfit: number;
  target: number;
  gap: number;
  go: boolean;
  exitLabel: string;
  large?: boolean;
}) {
  const { profit, localProfit, target, gap, go, exitLabel, large } = props;
  const localGap = localProfit - target;
  return (
    <div
      className={`rounded-md border ${
        go ? "border-desk-go/45 bg-desk-go/10" : "border-desk-nogo/45 bg-desk-nogo/10"
      } ${large ? "p-5" : "p-3"}`}
    >
      <p className="text-xs font-medium uppercase tracking-widest text-desk-muted">
        Est. profit — {exitLabel} (official)
      </p>
      <p
        className={`num font-black tracking-tight ${large ? "text-4xl" : "text-2xl"} ${
          profit >= target ? "text-desk-go" : "text-desk-nogo"
        }`}
      >
        {usd(profit)}
      </p>
      <p className="mt-1 text-xs text-desk-muted">
        Target {usd(target)}
        {gap >= 0 ? ` · ${usd(gap)} above floor` : ` · ${usd(Math.abs(gap))} short`}
      </p>
      <p className="mt-2 text-xs text-desk-muted">
        Local @ P25: <span className="num font-semibold text-desk-text">{usd(localProfit)}</span>
        {localProfit > profit ? ` (+${usd(localProfit - profit)} vs GB)` : ""}
      </p>
      <p className="mt-1 text-[10px] text-desk-muted">
        Verdict {go ? "GO" : "NO-GO"} on GunBroker only — override anytime.
      </p>
    </div>
  );
}

function Stat(props: { label: string; value: string; tone?: "go" | "nogo" }) {
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
