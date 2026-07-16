"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { AtGlancePanel } from "@/components/desk/AtGlancePanel";
import { OaCatalogPickers } from "@/components/desk/OaCatalogPickers";
import { SerialStolenPanel } from "@/components/desk/SerialStolenPanel";
import type { StolenCheckResult } from "@/lib/stolen/hotgunz";
import { allInCost } from "@/lib/arbitrage/acquisition";
import { defaultOutboundShip } from "@/lib/arbitrage/shipping";
import { evaluateDeal } from "@/lib/arbitrage/evaluate";
import type { DealInput, DecisionAnchor, EvaluationResult, PriceStats, ScenarioResult } from "@/lib/arbitrage/types";
import type { CompFilterMeta } from "@/lib/comp-filter";
import type { AskingCompRow, SoldCompRow } from "@/lib/gba/client";
import type { OaSelection } from "@/lib/gba/scorer";
import type { DealInsights } from "@/lib/deal-insights";
import { buildDealInsights, DEALER_OPTIONS } from "@/lib/deal-insights";
import { loadDealerDefaults, type DeskDealerDefaults } from "@/lib/desk-defaults";
import type { DeskMode, UsedSubtype, Workflow } from "@/lib/desk-mode";
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
    salesTaxPct: "9",
    sellChannel: "gunbroker" as "gunbroker" | "local",
    condition: "any",
    soldPrices: "",
    gbaModelId: "",
    gbaCaliberId: "",
  });
  const [data, setData] = useState<ApiResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [vaultOk, setVaultOk] = useState<boolean | null>(null);
  const [serial, setSerial] = useState("");
  const [stolen, setStolen] = useState<StolenCheckResult | null>(null);
  const [allowStolenProceed, setAllowStolenProceed] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem(MODE_STORAGE_KEY);
    if (saved === "used" || saved === "vendor") setWorkflow(saved);
    const sub = localStorage.getItem(SUBTYPE_STORAGE_KEY);
    if (sub === "auction" || sub === "tradein") setUsedSubtype(sub);
    const legacy = localStorage.getItem("desk-acquisition-mode");
    if (!saved && legacy === "dealer") setWorkflow("vendor");

    function applyDefaults(d: DeskDealerDefaults) {
      setForm((f) => ({
        ...f,
        targetProfit: d.targetProfit,
        salesTaxPct: d.salesTaxPct,
        outboundShip: d.outboundShip,
        listingUpgrades: d.listingUpgrades,
        buyerPremiumPct: d.buyerPremiumPct,
        buyerPaysOutboundShip: d.buyerPaysOutboundShip,
        buyerPaysCardFee: d.buyerPaysCardFee,
        sellChannel: d.sellChannel,
      }));
    }
    applyDefaults(loadDealerDefaults());
    const onDefaults = (e: Event) => {
      const detail = (e as CustomEvent<DeskDealerDefaults>).detail;
      if (detail) applyDefaults(detail);
    };
    window.addEventListener("desk-defaults-changed", onDefaults);
    return () => window.removeEventListener("desk-defaults-changed", onDefaults);
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
      .then((j: { ok?: boolean }) => {
        setVaultOk(Boolean(j.ok));
      })
      .catch(() => {
        setVaultOk(false);
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
    if (!isVendor && stolen?.status === "hit" && !allowStolenProceed) {
      setError("HotGunz HIT on this serial — clear the gun or check “I acknowledge / proceed anyway” before Evaluate.");
      return;
    }
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
          sellChannel: form.sellChannel,
          salesTaxPct: Number(form.salesTaxPct) || 0,
          autoComps: true,
          ...(form.gbaModelId.trim() && form.gbaCaliberId.trim()
            ? {
                gba: {
                  modelId: Number.parseInt(form.gbaModelId, 10),
                  caliberId: Number.parseInt(form.gbaCaliberId, 10),
                  condition:
                    isVendor || form.condition === "new"
                      ? ("New" as const)
                      : ("Used" as const),
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
      salesTaxRate: (Number(form.salesTaxPct) || 0) / 100,
      sellChannel: form.sellChannel,
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
        <p className="mb-4 text-xs text-desk-muted">
          Live OA token needs refresh on{" "}
          <Link href="/import" className="text-desk-accent hover:underline">
            Import → Connections
          </Link>{" "}
          (only needed to re-sync catalogs). Evaluate still uses your local OA comps DB.
        </p>
      )}

      <div className="mb-4">
        <h1 className="text-lg font-semibold tracking-tight text-desk-text">Evaluate</h1>
        <p className="text-xs text-desk-muted">Identify → Local or GB → max bid from sold comps.</p>
      </div>

      <div className="panel mb-4 space-y-3">
        <h2 className="text-sm font-semibold text-desk-muted">Workflow</h2>
        <div className="grid grid-cols-2 gap-2">
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
            <span className="mt-0.5 block text-[10px] opacity-80">OA catalog → max bid or offer</span>
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
          <div className="grid grid-cols-2 gap-2">
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

      {workflow === "used" && (
        <div className="mb-4 space-y-4">
          <SerialStolenPanel
            serial={serial}
            onSerialChange={(v) => {
              setSerial(v);
              setAllowStolenProceed(false);
            }}
            stolen={stolen}
            onStolen={(r) => {
              setStolen(r);
              setAllowStolenProceed(false);
            }}
          />
          {stolen?.status === "hit" && (
            <label className="flex items-start gap-2 text-xs text-desk-nogo">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={allowStolenProceed}
                onChange={(e) => setAllowStolenProceed(e.target.checked)}
              />
              <span>I acknowledge HotGunz HIT and still want to run Evaluate (not a legal clearance).</span>
            </label>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[360px_minmax(0,1fr)] 3xl:grid-cols-[400px_minmax(0,1fr)]">
        <form onSubmit={submit} className="panel space-y-4 lg:sticky lg:top-4 lg:self-start">
          <div>
            <h2 className="text-sm font-semibold text-desk-text">1. What is the gun?</h2>
            <p className="mt-0.5 text-[11px] text-desk-muted">
              Pick Make → Model → Caliber from the OA catalog.
            </p>
          </div>
          <OaCatalogPickers
            condition={isVendor ? "new" : isTradeIn ? "used" : form.condition}
            manufacturer={form.manufacturer}
            model={form.model}
            caliber={form.caliber}
            onPick={(sel) => {
              setForm((f) => ({
                ...f,
                manufacturer: sel.manufacturer,
                model: sel.model,
                caliber: sel.caliber,
                gbaModelId: String(sel.modelId),
                gbaCaliberId: String(sel.caliberId),
                condition: sel.condition === "NEW" ? "new" : "used",
              }));
            }}
          />
          <div className="grid grid-cols-2 gap-3">
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
            {isVendor && (
              <div className="col-span-2 grid gap-3 sm:grid-cols-2">
                <FieldHint
                  label="UPC"
                  hint="Strongly recommended — tightens comps to your exact SKU."
                  v={form.upc}
                  on={set("upc")}
                  onBlur={() => void lookupCatalogUpc(form.upc)}
                />
                <FieldHint label="MPN / item #" hint="Filters wrong variants." v={form.mpn} on={set("mpn")} />
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
              </div>
            )}
            {!isVendor && (
              <details className="col-span-2 text-xs text-desk-muted">
                <summary className="cursor-pointer">UPC / MPN / text overrides (rare)</summary>
                <p className="mt-1 text-[11px]">
                  Only if the OA leaf is wrong or missing — normally the dropdowns above are enough.
                </p>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <Field label="Brand override" v={form.manufacturer} on={set("manufacturer")} />
                  <Field label="Model override" v={form.model} on={set("model")} />
                  <Field label="Caliber override" v={form.caliber} on={set("caliber")} />
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
          </div>

          <div className="border-t border-desk-border pt-3">
            <h2 className="text-sm font-semibold text-desk-text">2. How will you sell it?</h2>
            <p className="mt-0.5 mb-2 text-[11px] text-desk-muted">
              Max bid / GO-NO-GO use this channel’s fees only.
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setForm((f) => ({ ...f, sellChannel: "local" }))}
                className={`rounded-md border px-3 py-2.5 text-left text-xs transition ${
                  form.sellChannel === "local"
                    ? "border-desk-accent bg-desk-accent/15 text-desk-text"
                    : "border-desk-border text-desk-muted hover:border-desk-muted"
                }`}
              >
                <span className="block font-semibold">Local</span>
                <span className="mt-0.5 block text-[10px] opacity-80">In-store / pickup · sales tax</span>
              </button>
              <button
                type="button"
                onClick={() => setForm((f) => ({ ...f, sellChannel: "gunbroker" }))}
                className={`rounded-md border px-3 py-2.5 text-left text-xs transition ${
                  form.sellChannel === "gunbroker"
                    ? "border-desk-accent bg-desk-accent/15 text-desk-text"
                    : "border-desk-border text-desk-muted hover:border-desk-muted"
                }`}
              >
                <span className="block font-semibold">GunBroker</span>
                <span className="mt-0.5 block text-[10px] opacity-80">Ship · listing · card fees</span>
              </button>
            </div>
          </div>

          <div className="border-t border-desk-border pt-3 space-y-3">
            <div>
              <h2 className="text-sm font-semibold text-desk-text">3. Your money rules</h2>
              <p className="mt-0.5 text-[11px] text-desk-muted">
                Minimum profit you need after exit fees (at conservative P25 sold).
              </p>
            </div>
            <FieldHint
              label="Min profit ($)"
              hint="GO when channel profit at P25 ≥ this amount."
              v={form.targetProfit}
              on={set("targetProfit")}
            />

            {form.sellChannel === "local" ? (
              <FieldHint
                label="Sales tax %"
                hint="Backed out of the local sell price (e.g. 9 for Alabama)."
                v={form.salesTaxPct}
                on={set("salesTaxPct")}
              />
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <FieldHint
                    label="Outbound ship ($)"
                    hint="Listing ship charge (buyer pays if checked below)."
                    v={form.outboundShip}
                    on={set("outboundShip")}
                  />
                  <FieldHint
                    label="Listing fees ($)"
                    hint="GunBroker listing upgrades — always deducted from your net."
                    v={form.listingUpgrades}
                    on={set("listingUpgrades")}
                  />
                </div>
                <div className="flex flex-col gap-2 rounded-md border border-desk-border bg-desk-panel2 p-3">
                  <BuyerPaidFeeToggle
                    id="buyer-pays-ship"
                    title="Buyer pays outbound shipping"
                    hint="Ship not deducted from max bid / net."
                    checked={form.buyerPaysOutboundShip}
                    onChange={(checked) => setForm((f) => ({ ...f, buyerPaysOutboundShip: checked }))}
                  />
                  <BuyerPaidFeeToggle
                    id="buyer-pays-card"
                    title="Buyer pays card / CC fees"
                    hint="~3% processing not deducted from your net."
                    checked={form.buyerPaysCardFee}
                    onChange={(checked) => setForm((f) => ({ ...f, buyerPaysCardFee: checked }))}
                  />
                </div>
              </div>
            )}
          </div>

          <div className="border-t border-desk-border pt-3 space-y-3">
            <div>
              <h2 className="text-sm font-semibold text-desk-text">
                {isVendor ? "4. Your dealer cost" : "4. Auction / buy-side (optional)"}
              </h2>
              <p className="mt-0.5 text-[11px] text-desk-muted">
                {isVendor
                  ? "Price on the vendor ad."
                  : isTradeIn
                    ? "Inbound ship only — no buyer premium on trade-ins."
                    : "Buyer’s premium + inbound ship set the max hammer. Enter live bid after Evaluate to check GO/NO-GO."}
              </p>
            </div>
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
                  hint="Include CC in this number if the auction stacks it (e.g. 15% + 3.5% = 18.5%)."
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
                  <span className="text-desk-muted">Working all-in </span>
                  <span className="num font-bold text-desk-text">{usd(previewAllIn)}</span>
                </div>
              )}
            </div>
          </div>

          <details className="text-xs text-desk-muted">
            <summary className="cursor-pointer">Advanced (OA IDs / manual solds)</summary>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <Field label="Model ID" v={form.gbaModelId} on={set("gbaModelId")} />
              <Field label="Caliber ID" v={form.gbaCaliberId} on={set("gbaCaliberId")} />
            </div>
            <input
              className="field-input mt-2"
              value={form.soldPrices}
              onChange={set("soldPrices")}
              placeholder="Manual sold prices (comma-separated)"
            />
          </details>

          <button
            type="submit"
            disabled={loading || !form.gbaModelId || !form.gbaCaliberId}
            className="w-full rounded-md bg-desk-accent px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
          >
            {loading
              ? "Loading market comps…"
              : form.gbaModelId && form.gbaCaliberId
                ? `Get ${isTradeIn ? "max offer" : "max bid"} (${form.sellChannel === "local" ? "Local" : "GB"})`
                : "Pick Make → Model → Caliber first"}
          </button>
          {loading && (
            <p className="text-center text-xs text-desk-muted">
              Pulling sold comps from local OA cache (or live OA if needed)…
            </p>
          )}
          {error && <p className="text-sm text-desk-nogo">{error}</p>}
        </form>

        <section className="space-y-4">
          {!data && !loading && (
            <div className="panel space-y-3 py-10 text-center text-sm text-desk-muted">
              <p className="text-base font-semibold text-desk-text">Find what a gun is worth</p>
              <ol className="mx-auto max-w-md space-y-1 text-left text-xs">
                <li>1. Pick <strong className="text-desk-text">Make → Model → Caliber</strong> from OA</li>
                <li>
                  2. Choose <strong className="text-desk-text">Local</strong> or{" "}
                  <strong className="text-desk-text">GunBroker</strong> and set min profit + fees
                </li>
                <li>3. Get your <strong className="text-desk-text">max bid / max offer</strong> from sold comps</li>
              </ol>
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
              <p className="text-xs font-medium uppercase tracking-widest text-desk-accent">
                Dealer buy — decision summary
              </p>
              <ul className="space-y-1.5 text-sm text-desk-text">
                {insights.headlines.map((line, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="text-desk-accent">•</span>
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <details className="panel group">
            <summary className="cursor-pointer text-sm font-semibold text-desk-text">
              Market details
              <span className="ml-2 text-xs font-normal text-desk-muted">
                comps, exits, wholesale — expand if needed
              </span>
            </summary>
            <div className="mt-4 space-y-4 border-t border-desk-border pt-4">
              {data?.sourceStatus?.gba && (
                <p className="text-xs text-desk-muted">{data.sourceStatus.gba}</p>
              )}

              {sold && sold.count > 0 && (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div className="rounded-md border border-desk-border bg-desk-panel2 p-3">
                    <p className="text-[10px] uppercase text-desk-muted">P25 sold</p>
                    <p className="num text-2xl font-bold">{usd(sold.p25)}</p>
                  </div>
                  <div className="rounded-md border border-desk-border bg-desk-panel2 p-3">
                    <p className="text-[10px] uppercase text-desk-muted">Median sold</p>
                    <p className="num text-2xl font-bold">{usd(sold.median)}</p>
                  </div>
                  <div className="rounded-md border border-desk-border bg-desk-panel2 p-3">
                    <p className="text-[10px] uppercase text-desk-muted">Sample</p>
                    <p className="num text-2xl font-bold">{sold.count}</p>
                  </div>
                </div>
              )}

              {r && sold && sold.count > 0 && (
                <ExitComparisonPanel
                  chosen={r.chosen}
                  targetProfit={r.input.targetProfit}
                  verdict={r.verdict}
                  maxBidGb={form.sellChannel === "local" ? r.chosen.maxBid : r.maxBid}
                  localMaxBid={r.localMaxBid}
                  profitGb={r.chosen.netProfit}
                  localProfit={r.localNetProfit}
                  profitUpside={r.profitUpside}
                  upsideRoute={r.upsideRoute}
                  allIn={r.allInCost}
                  hammerOverCeiling={hammerOverCeiling}
                  enteredHammer={enteredHammerOrPrice}
                  isAuction={isAuction}
                  sellChannel={form.sellChannel}
                />
              )}

              {soldListings.length > 0 && (
                <div className="overflow-x-auto">
                  <h3 className="mb-2 text-sm font-semibold text-desk-muted">
                    Sold comps — {soldListings.length}
                  </h3>
                  <table className="w-full min-w-[480px] text-sm">
                    <thead className="text-left text-xs uppercase text-desk-muted">
                      <tr>
                        <th className="py-1">Price</th>
                        <th>Sold</th>
                        <th>Type</th>
                      </tr>
                    </thead>
                    <tbody className="num">
                      {soldListings.slice(0, 25).map((row, i) => (
                        <tr key={i} className="border-t border-desk-border">
                          <td className="py-1.5 font-semibold">{usd(row.price)}</td>
                          <td className="font-sans text-desk-muted">{row.salesDate || "—"}</td>
                          <td className="font-sans text-desk-muted">{row.listingType || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {renderWholesaleBlock()}
            </div>
          </details>
          </>
          )}
        </section>
      </div>
    </main>
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

