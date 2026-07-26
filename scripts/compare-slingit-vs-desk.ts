/**
 * Compare Slingit appraisals vs live Gun Value Desk /api/evaluate.
 * Usage: npx tsx scripts/compare-slingit-vs-desk.ts [baseUrl]
 */

import { writeFileSync } from "node:fs";

const base = (process.argv[2] ?? "https://desk.modulargunworks.com").replace(/\/$/, "");

type SlingitGun = {
  label: string;
  manufacturer: string;
  model: string;
  caliber: string;
  category: "rifle" | "shotgun" | "handgun";
  variant?: string;
  slingitRetail: number | null;
  slingitOfferOrPaid: number;
  status: "acquired" | "incomplete" | "listed";
  notes?: string;
};

/** Snapshot from Modular Gunworks Slingit Pro (Jul 18, 2026). */
const GUNS: SlingitGun[] = [
  {
    label: "Marlin Model 39A Golden",
    manufacturer: "Marlin",
    model: "39A",
    caliber: "22 LR",
    category: "rifle",
    variant: "Golden",
    slingitRetail: 1050,
    slingitOfferOrPaid: 621,
    status: "acquired",
    notes: "Slingit: $606 gun + $15 accessory; Excellent; Lyman peep",
  },
  {
    label: "Winchester Model 9422M",
    manufacturer: "Winchester",
    model: "9422M",
    caliber: "22 WMR",
    category: "rifle",
    slingitRetail: null,
    slingitOfferOrPaid: 710,
    status: "acquired",
    notes: "Retail not captured in UI snapshot; compare on paid + OA",
  },
  {
    label: "Browning A-500G Invector",
    manufacturer: "Browning",
    model: "A-500G",
    caliber: "12 Gauge",
    category: "shotgun",
    slingitRetail: 475,
    slingitOfferOrPaid: 335,
    status: "incomplete",
  },
  {
    label: "Remington Model 1100 Field",
    manufacturer: "Remington",
    model: "1100",
    caliber: "12 Gauge",
    category: "shotgun",
    variant: "Field",
    slingitRetail: 400,
    slingitOfferOrPaid: 280,
    status: "incomplete",
  },
  {
    label: "Maadi ARM Crutch Folder",
    manufacturer: "Maadi",
    model: "ARM",
    caliber: "7.62x39",
    category: "rifle",
    variant: "Crutch Folder",
    slingitRetail: 2200,
    slingitOfferOrPaid: 1540,
    status: "incomplete",
  },
  {
    label: "Norinco MAK-90 Sporter Post-Ban",
    manufacturer: "Norinco",
    model: "MAK-90",
    caliber: "7.62x39",
    category: "rifle",
    variant: "Sporter",
    slingitRetail: 900,
    slingitOfferOrPaid: 640,
    status: "incomplete",
  },
  {
    label: "Canik METE MC9 (listed ask)",
    manufacturer: "Canik",
    model: "METE MC9",
    caliber: "9mm",
    category: "handgun",
    slingitRetail: 285,
    slingitOfferOrPaid: 200,
    status: "listed",
    notes: "Slingit retail = listing ask $285; desk cost probe $200 hypothetical buy",
  },
  {
    label: "Taurus G2s (listed ask)",
    manufacturer: "Taurus",
    model: "G2s",
    caliber: "9mm",
    category: "handgun",
    slingitRetail: 145,
    slingitOfferOrPaid: 100,
    status: "listed",
    notes: "Listing ask $145; desk cost probe $100",
  },
  {
    label: "Smith & Wesson SD9 VE (listed ask)",
    manufacturer: "Smith & Wesson",
    model: "SD9 VE",
    caliber: "9mm",
    category: "handgun",
    slingitRetail: 280,
    slingitOfferOrPaid: 200,
    status: "listed",
    notes: "Listing ask $280; desk cost probe $200",
  },
];

function num(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

async function evaluate(
  gun: SlingitGun,
  opts: {
    sellChannel: "local" | "gunbroker";
    cost: number;
    targetProfit: number;
    minMarginPct: number;
    listingUpgrades?: number;
  },
) {
  const body = {
    workflow: "used",
    usedSubtype: "tradein",
    manufacturer: gun.manufacturer,
    model: gun.model,
    caliber: gun.caliber,
    category: gun.category,
    condition: "used" as const,
    lotTitle: `${gun.manufacturer} ${gun.model}${gun.variant ? ` ${gun.variant}` : ""} ${gun.caliber}`,
    targetAcquisitionCost: opts.cost,
    inboundShip: 0,
    buyerPremiumPct: 0,
    sellChannel: opts.sellChannel,
    salesTaxPct: 9,
    targetProfit: opts.targetProfit,
    minMarginPct: opts.minMarginPct,
    listingUpgrades: opts.listingUpgrades ?? 0,
    buyerPaysOutboundShip: true,
    buyerPaysCardFee: true,
    autoComps: true,
  };

  const res = await fetch(`${base}/api/evaluate`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text) as Record<string, unknown>;
}

function scenario(raw: Record<string, unknown>, label: string) {
  const result = raw.result as Record<string, unknown> | undefined;
  const scenarios = (result?.scenarios as Array<Record<string, unknown>> | undefined) ?? [];
  return scenarios.find((s) => s.label === label);
}

function summarize(raw: Record<string, unknown>) {
  const result = raw.result as Record<string, unknown> | undefined;
  const sold = result?.sold as Record<string, unknown> | undefined;
  const chosen = result?.chosen as Record<string, unknown> | undefined;
  const med = scenario(raw, "Median");
  const p25 = scenario(raw, "P25");
  const catalog = raw.catalogMatch as Record<string, unknown> | undefined;
  const insights = raw.insights as Record<string, unknown> | undefined;
  const asking = raw.asking as Record<string, unknown> | undefined;

  return {
    soldCount: num(sold?.count) ?? 0,
    low: num(sold?.low),
    p25: num(sold?.p25),
    median: num(sold?.median),
    p75: num(sold?.p75),
    high: num(sold?.high),
    askingMedian: num(asking?.median) ?? num(insights?.askingMedian),
    match: catalog
      ? `${catalog.manufacturer} ${catalog.model} ${catalog.caliber} (score ${catalog.score})`
      : null,
    matchTier: (raw.compMeta as Record<string, unknown> | undefined)?.matchTier ?? null,
    chosenLabel: (chosen?.label as string) ?? null,
    chosenSell: num(chosen?.sellPrice),
    verdict: (result?.verdict as string) ?? null,
    maxBid: num(result?.maxBid),
    // At this cost, median-scenario economics
    medianSell: num(med?.sellPrice),
    medianBestRoute: (med?.bestRoute as string) ?? null,
    medianNetProfit: num(med?.netProfit),
    medianLocalProfit: num(med?.localProfit),
    medianMaxBid: num(med?.maxBid),
    medianLocalMaxBid: num(med?.localMaxBid),
    p25MaxBid: num(p25?.maxBid),
    p25LocalMaxBid: num(p25?.localMaxBid),
    p25NetProfit: num(p25?.netProfit),
    headlines: insights?.headlines ?? [],
  };
}

async function runGun(gun: SlingitGun) {
  // Trade-in buy: cost = what Slingit paid/offered. Desk defaults: $75 profit, 15% margin.
  const atPaidLocal = summarize(
    await evaluate(gun, {
      sellChannel: "local",
      cost: gun.slingitOfferOrPaid,
      targetProfit: 75,
      minMarginPct: 15,
    }),
  );
  const atPaidGb = summarize(
    await evaluate(gun, {
      sellChannel: "gunbroker",
      cost: gun.slingitOfferOrPaid,
      targetProfit: 75,
      minMarginPct: 15,
    }),
  );

  // What desk would allow you to pay (30% margin floor ≈ Slingit store setting)
  const ceilLocal30 = summarize(
    await evaluate(gun, {
      sellChannel: "local",
      cost: 0,
      targetProfit: 75,
      minMarginPct: 30,
    }),
  );
  const ceilGb30 = summarize(
    await evaluate(gun, {
      sellChannel: "gunbroker",
      cost: 0,
      targetProfit: 75,
      minMarginPct: 30,
    }),
  );

  const retail = gun.slingitRetail;
  const deskMedian = atPaidLocal.median ?? atPaidGb.median;
  const retailVsMedianPct =
    retail != null && deskMedian != null && deskMedian > 0
      ? Math.round(((retail - deskMedian) / deskMedian) * 1000) / 10
      : null;

  return {
    gun: gun.label,
    status: gun.status,
    notes: gun.notes,
    slingit: {
      retail,
      offerOrPaid: gun.slingitOfferOrPaid,
      offerAsPctOfRetail:
        retail != null && retail > 0
          ? Math.round((gun.slingitOfferOrPaid / retail) * 1000) / 10
          : null,
    },
    desk: {
      match: atPaidLocal.match ?? atPaidGb.match,
      matchTier: atPaidLocal.matchTier ?? atPaidGb.matchTier,
      soldCount: atPaidLocal.soldCount || atPaidGb.soldCount,
      oa: {
        low: atPaidLocal.low ?? atPaidGb.low,
        p25: atPaidLocal.p25 ?? atPaidGb.p25,
        median: deskMedian,
        p75: atPaidLocal.p75 ?? atPaidGb.p75,
        high: atPaidLocal.high ?? atPaidGb.high,
        askingMedian: atPaidLocal.askingMedian ?? atPaidGb.askingMedian,
      },
      retailVsOaMedianPct: retailVsMedianPct,
      atSlingitPaid: {
        localVerdict: atPaidLocal.verdict,
        gbVerdict: atPaidGb.verdict,
        medianNetProfitLocal: atPaidLocal.medianLocalProfit,
        medianNetProfitGb: atPaidGb.medianNetProfit,
        p25NetProfitGb: atPaidGb.p25NetProfit,
        deskMaxBidAt15pctLocal: atPaidLocal.maxBid,
        deskMaxBidAt15pctGb: atPaidGb.maxBid,
      },
      deskMaxPayAt30pctMargin: {
        // closer apples-to-apples with Slingit 30% gross margin setting
        localP25: ceilLocal30.p25LocalMaxBid,
        localMedian: ceilLocal30.medianLocalMaxBid,
        gbP25: ceilGb30.p25MaxBid,
        gbMedian: ceilGb30.medianMaxBid,
        headlineLocal: ceilLocal30.headlines,
        headlineGb: ceilGb30.headlines,
      },
    },
  };
}

console.error(`Comparing ${GUNS.length} guns via ${base}/api/evaluate …`);

const results = [];
for (const gun of GUNS) {
  process.stderr.write(`  → ${gun.label}… `);
  try {
    const row = await runGun(gun);
    results.push(row);
    const oa = row.desk.oa.median;
    const retail = row.slingit.retail;
    const delta =
      retail != null && oa != null ? `${row.desk.retailVsOaMedianPct! > 0 ? "+" : ""}${row.desk.retailVsOaMedianPct}%` : "n/a";
    console.error(
      `Slingit retail=${retail ?? "—"} paid=${row.slingit.offerOrPaid} | OA med=${oa ?? "—"} n=${row.desk.soldCount} (retail vs OA ${delta}) | @paid ${row.desk.atSlingitPaid.localVerdict}/${row.desk.atSlingitPaid.gbVerdict}`,
    );
  } catch (e) {
    const err = e instanceof Error ? e.message : String(e);
    results.push({ gun: gun.label, error: err });
    console.error(`ERR ${err}`);
  }
}

const outPath = "scripts/compare-slingit-vs-desk.out.json";
const payload = { base, generatedAt: new Date().toISOString(), results };
writeFileSync(outPath, JSON.stringify(payload, null, 2));
console.log(JSON.stringify(payload, null, 2));
console.error(`wrote ${outPath}`);
