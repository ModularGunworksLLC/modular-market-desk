/**
 * Master catalog search — group/rank distributor offers.
 * Intentionally does NOT apply Evaluate firearm-only filters (parts must remain searchable).
 */

export type CatalogOfferInput = {
  id: string;
  vendorName: string;
  sku: string | null;
  upc: string | null;
  manufacturer: string;
  model: string;
  caliber: string | null;
  category: string | null;
  description: string | null;
  dealerPrice: number;
  salePrice: number | null;
  onSale: boolean;
  qty: number | null;
  inStock: boolean;
};

export type CatalogOffer = CatalogOfferInput & {
  effectivePrice: number;
};

export type CatalogProductGroup = {
  groupKey: string;
  upc: string | null;
  manufacturer: string;
  model: string;
  caliber: string | null;
  category: string | null;
  label: string;
  offers: CatalogOffer[];
  bestOffer: CatalogOffer;
  vendorCount: number;
  inStockCount: number;
  priceSpread: number | null;
};

/** Preset keywords for parts / build shopping. */
export const PARTS_KEYWORD_FACETS = [
  { id: "bcg", label: "BCG", q: "BCG" },
  { id: "barrel", label: "Barrel", q: "barrel" },
  { id: "lower", label: "Lower", q: "lower" },
  { id: "upper", label: "Upper", q: "upper" },
  { id: "optic", label: "Optic", q: "optic" },
  { id: "optic_sight", label: "Red Dot", q: "red dot" },
  { id: "magazine", label: "Magazine", q: "magazine" },
  { id: "trigger", label: "Trigger", q: "trigger" },
] as const;

/** Digits-only UPC/GTIN cleanup; returns null if too short. */
export function normalizeCatalogUpc(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = String(raw).replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 14) return null;
  return digits;
}

export function normCatalogText(s: string | null | undefined): string {
  return String(s ?? "")
    .toUpperCase()
    .replace(/&/g, " AND ")
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Prefer sale price when on sale and cheaper than dealer. */
export function effectiveDealerPrice(row: {
  dealerPrice: number;
  salePrice?: number | null;
  onSale?: boolean;
}): number {
  const dealer = Number(row.dealerPrice);
  if (!Number.isFinite(dealer) || dealer < 0) return 0;
  const sale = row.salePrice != null ? Number(row.salePrice) : null;
  if (row.onSale && sale != null && Number.isFinite(sale) && sale > 0 && sale < dealer) {
    return sale;
  }
  return dealer;
}

/**
 * Group key: UPC when present, else manufacturer|model(|caliber).
 * Pure — same identity across vendors collapses into one product card.
 */
export function catalogGroupKey(row: {
  upc: string | null;
  manufacturer: string;
  model: string;
  caliber?: string | null;
}): string {
  const upc = normalizeCatalogUpc(row.upc);
  if (upc) return `upc:${upc}`;
  const mfr = normCatalogText(row.manufacturer) || "UNKNOWN";
  const model = normCatalogText(row.model) || "UNKNOWN";
  const cal = normCatalogText(row.caliber ?? "");
  return cal ? `id:${mfr}|${model}|${cal}` : `id:${mfr}|${model}`;
}

export function pickBestOffer(offers: CatalogOffer[]): CatalogOffer {
  if (offers.length === 0) {
    throw new Error("pickBestOffer requires at least one offer");
  }
  const inStock = offers.filter((o) => o.inStock);
  const pool = inStock.length > 0 ? inStock : offers;
  return pool.reduce((best, o) => (o.effectivePrice < best.effectivePrice ? o : best));
}

function productLabel(row: CatalogOfferInput): string {
  const desc = row.description?.trim();
  if (desc) return desc;
  const bits = [row.manufacturer, row.model].filter(Boolean);
  return bits.join(" ") || "—";
}

export type CatalogSearchParams = {
  q?: string;
  vendor?: string;
  category?: string;
  inStockOnly?: boolean;
  /** Max product groups returned. */
  limit?: number;
  /** Max raw rows pulled before grouping. */
  rowLimit?: number;
};

/** Parse URL search params for the catalog search route (pure / testable). */
export function parseCatalogSearchParams(url: URL): CatalogSearchParams {
  const q = url.searchParams.get("q") ?? "";
  const vendor = url.searchParams.get("vendor") ?? "";
  const category = url.searchParams.get("category") ?? "";
  const inStockOnly =
    url.searchParams.get("inStockOnly") === "1" || url.searchParams.get("inStockOnly") === "true";
  const limitRaw = Number(url.searchParams.get("limit") ?? "40");
  const limit = Number.isFinite(limitRaw) ? limitRaw : 40;
  return {
    q,
    vendor: vendor || undefined,
    category: category || undefined,
    inStockOnly,
    limit,
  };
}

/**
 * Collapse raw catalog rows into product groups ranked by best (in-stock) price.
 */
export function groupCatalogOffers(
  rows: CatalogOfferInput[],
  opts: { groupLimit?: number } = {},
): CatalogProductGroup[] {
  const groupLimit = opts.groupLimit ?? 40;
  const byKey = new Map<string, CatalogOffer[]>();

  for (const row of rows) {
    const effectivePrice = effectiveDealerPrice(row);
    if (!(effectivePrice > 0)) continue;
    const offer: CatalogOffer = { ...row, effectivePrice };
    const key = catalogGroupKey(row);
    const list = byKey.get(key);
    if (list) list.push(offer);
    else byKey.set(key, [offer]);
  }

  const groups: CatalogProductGroup[] = [];
  for (const [groupKey, offers] of byKey) {
    // Keep cheapest offer per vendor within the group
    const byVendor = new Map<string, CatalogOffer>();
    for (const o of offers) {
      const prev = byVendor.get(o.vendorName);
      if (!prev || o.effectivePrice < prev.effectivePrice) byVendor.set(o.vendorName, o);
    }
    const vendorOffers = [...byVendor.values()].sort((a, b) => a.effectivePrice - b.effectivePrice);
    if (vendorOffers.length === 0) continue;

    const bestOffer = pickBestOffer(vendorOffers);
    const prices = vendorOffers.map((o) => o.effectivePrice);
    const minP = Math.min(...prices);
    const maxP = Math.max(...prices);
    const head = vendorOffers[0]!;

    groups.push({
      groupKey,
      upc: normalizeCatalogUpc(head.upc) ?? normalizeCatalogUpc(bestOffer.upc),
      manufacturer: head.manufacturer,
      model: head.model,
      caliber: head.caliber,
      category: head.category ?? bestOffer.category,
      label: productLabel(bestOffer),
      offers: vendorOffers,
      bestOffer,
      vendorCount: vendorOffers.length,
      inStockCount: vendorOffers.filter((o) => o.inStock).length,
      priceSpread: maxP > minP ? maxP - minP : null,
    });
  }

  groups.sort((a, b) => {
    // Prefer multi-vendor, then cheaper best offer
    if (b.vendorCount !== a.vendorCount) return b.vendorCount - a.vendorCount;
    return a.bestOffer.effectivePrice - b.bestOffer.effectivePrice;
  });

  return groups.slice(0, groupLimit);
}
