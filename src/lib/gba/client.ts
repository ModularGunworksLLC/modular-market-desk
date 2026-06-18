/**
 * GunBroker Analytics (Outdoor Analytics) portal API client.
 * Bearer-authenticated, called directly from Lightsail. Token comes from the Session Vault.
 *
 *   GET /pricing/data            -> historical SOLD rows
 *   GET /pricing/active-listings -> active ASKING rows
 */

import { summarize } from "@/lib/arbitrage/stats";
import { normalizeVaultSecret, redactSecrets } from "@/lib/vault";
import type { PriceStats } from "@/lib/arbitrage/types";
import { buildDecisionStats, type CompFilterMeta } from "@/lib/comp-filter";
import { extractGunBrokerItemId } from "@/lib/gunbroker-url";
import { resolveQueryAttempts, resolveSelection } from "@/lib/gba/scorer";
import type { GbaQuery, OaDependencies, OaSelection } from "@/lib/gba/scorer";

const DEFAULT_BASE = process.env.GBA_API_BASE ?? "https://api.gunbrokeranalytics.com/gba-portal-api";
const DEFAULT_TIMEOUT_MS = 180_000;
const DEPS_CACHE_TTL_MS = 60 * 60 * 1000;

let dependenciesCache: { loadedAt: number; data: OaDependencies } | null = null;

export class GbaApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "GbaApiError";
  }
}

export interface SoldCompRow {
  price: number;
  salesDate: string;
  listingType: string;
  /** Present when the API returns a title (used to drop parts/mags from comps). */
  title?: string;
  /** When Outdoor Analytics includes auction detail on sold rows. */
  startingBid?: number | null;
  bidCount?: number | null;
}

export interface AskingCompRow {
  price: number;
  title: string;
  condition: string;
  location: string;
  itemId: string | null;
}

export interface GbaMarket {
  sold: PriceStats;
  asking: PriceStats;
  soldRaw: number[];
  askingRaw: number[];
  soldRows: SoldCompRow[];
  askingRows: AskingCompRow[];
  compMeta: CompFilterMeta;
}

export class GbaApiClient {
  private readonly token: string;
  private readonly base: string;

  constructor(token: string, opts?: { baseUrl?: string }) {
    this.token = normalizeVaultSecret(token);
    if (!this.token) throw new GbaApiError("Missing GunBroker Analytics bearer token");
    this.base = (opts?.baseUrl ?? DEFAULT_BASE).replace(/\/$/, "");
  }

  private async get<T = unknown>(path: string, params?: Record<string, string | number>): Promise<T> {
    const url = new URL(`${this.base}${path}`);
    for (const [k, v] of Object.entries(params ?? {})) url.searchParams.set(k, String(v));

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), DEFAULT_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(url, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${this.token}`,
          Accept: "application/json",
          "X-Skip-Cache": "true",
        },
        signal: ctrl.signal,
        cache: "no-store",
      });
    } catch (err) {
      throw new GbaApiError(`Request failed: ${redactSecrets((err as Error).message)}`);
    } finally {
      clearTimeout(timer);
    }

    if (res.status === 401) {
      throw new GbaApiError("Unauthorized - re-paste the Outdoor Analytics token", 401);
    }
    if (!res.ok) {
      throw new GbaApiError(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`, res.status);
    }

    const body = (await res.json()) as unknown;
    // The portal wraps payloads as { data: ... } in some responses.
    if (body && typeof body === "object" && "data" in body) {
      return (body as { data: T }).data;
    }
    return body as T;
  }

  /** Catalog dependency tree keyed by condition bucket (NEW / USED). Cached 1h in-process. */
  async dependencies(): Promise<OaDependencies> {
    const now = Date.now();
    if (dependenciesCache && now - dependenciesCache.loadedAt < DEPS_CACHE_TTL_MS) {
      return dependenciesCache.data;
    }
    const data = await this.get<OaDependencies>("/pricing/dependencies");
    const deps = data && typeof data === "object" ? data : {};
    dependenciesCache = { loadedAt: now, data: deps };
    return deps;
  }

  /** Resolve desk free-text identity to a catalog model/caliber selection. */
  async resolve(query: GbaQuery): Promise<OaSelection | null> {
    return resolveSelection(await this.dependencies(), query);
  }

  /**
   * Fully automatic comps pull: resolve the catalog selection from free text,
   * then fetch sold + asking sets for it. Returns null when no catalog match.
   */
  async resolveMarket(query: GbaQuery): Promise<(GbaMarket & { selection: OaSelection }) | null> {
    const deps = await this.dependencies();
    let selection: OaSelection | null = null;
    for (const attempt of resolveQueryAttempts(query)) {
      selection = resolveSelection(deps, attempt);
      if (selection) break;
    }
    if (!selection) return null;
    const market = await this.market({
      modelId: selection.modelId,
      caliberId: selection.caliberId,
      condition: selection.conditionParam,
      category: query.category,
    });
    return { ...market, selection };
  }

  /** Historical SOLD rows for a resolved model/caliber. */
  async pricingDataRows(args: {
    modelId: number;
    caliberId: number;
    condition: "New" | "Used";
  }): Promise<SoldCompRow[]> {
    const rows = await this.get<Array<Record<string, unknown>>>("/pricing/data", {
      modelID: args.modelId,
      caliberID: args.caliberId,
      condition: args.condition,
    });
    if (!Array.isArray(rows)) return [];
    const out: SoldCompRow[] = [];
    for (const row of rows) {
      const price = Number(row.Amount);
      if (!Number.isFinite(price) || price <= 0) continue;
      const title = String(row.ItemTitle ?? row.Title ?? row.Description ?? "").trim();
      const startRaw = row.StartingBid ?? row.StartBid ?? row.MinimumBid ?? row.OpeningBid;
      const bidsRaw = row.BidCount ?? row.NumberOfBids ?? row.Bids ?? row.TotalBids;
      const startingBid = Number(startRaw);
      const bidCount = Number(bidsRaw);
      out.push({
        price,
        salesDate: String(row.SalesDate ?? ""),
        listingType: String(row.ListingType ?? ""),
        ...(title ? { title } : {}),
        ...(Number.isFinite(startingBid) && startingBid > 0 ? { startingBid } : { startingBid: null }),
        ...(Number.isFinite(bidCount) && bidCount >= 0 ? { bidCount: Math.round(bidCount) } : { bidCount: null }),
      });
    }
    return out;
  }

  /** Historical SOLD prices for a resolved model/caliber. */
  async pricingData(args: { modelId: number; caliberId: number; condition: "New" | "Used" }): Promise<number[]> {
    const rows = await this.pricingDataRows(args);
    return rows.map((r) => r.price);
  }

  /** Active ASKING rows for a resolved model/caliber. */
  async activeListingRows(args: {
    modelId: number;
    caliberId: number;
    useParentModel?: boolean;
  }): Promise<AskingCompRow[]> {
    const rows = await this.get<Array<Record<string, unknown>>>("/pricing/active-listings", {
      modelID: args.modelId,
      caliberID: args.caliberId,
      useParentModel: args.useParentModel === false ? "0" : "1",
    });
    if (!Array.isArray(rows)) return [];
    const out: AskingCompRow[] = [];
    for (const row of rows) {
      const price = activeListingPrice(row);
      if (price == null || price <= 0) continue;
      const loc = [
        String(row.ShipsFromCity ?? "").trim(),
        String(row.ShipsFromState ?? "").trim(),
      ]
        .filter(Boolean)
        .join(", ");
      out.push({
        price,
        title: String(row.ItemTitle ?? row.Title ?? "").trim(),
        condition: String(row.Condition ?? "").trim(),
        location: loc,
        itemId: extractGunBrokerItemId(row),
      });
    }
    return out.sort((a, b) => a.price - b.price);
  }

  /** Active ASKING prices for a resolved model/caliber. */
  async activeListings(args: { modelId: number; caliberId: number; useParentModel?: boolean }): Promise<number[]> {
    const rows = await this.activeListingRows(args);
    return rows.map((r) => r.price);
  }

  /** Pull both sold + asking sets and summarize into percentile stats. */
  async market(args: {
    modelId: number;
    caliberId: number;
    condition: "New" | "Used";
    category?: string;
  }): Promise<GbaMarket> {
    const [soldRows, askingRows] = await Promise.all([
      this.pricingDataRows(args),
      this.activeListingRows({ modelId: args.modelId, caliberId: args.caliberId }),
    ]);
    const soldRaw = soldRows.map((r) => r.price);
    const askingRaw = askingRows.map((r) => r.price);
    const filtered = buildDecisionStats(soldRaw, askingRaw, soldRows, askingRows, args.category);
    return {
      soldRaw,
      askingRaw,
      soldRows: filtered.soldDisplay,
      askingRows: filtered.askingDisplay,
      sold: filtered.sold,
      asking: filtered.asking,
      compMeta: filtered.meta,
    };
  }
}

/** Resolve a usable price from an active-listing row (fixed price or current/starting bid). */
function activeListingPrice(row: Record<string, unknown>): number | null {
  if (String(row.ListingType ?? "") === "FIXED PRICE") {
    const fixed = Number(row.FixedPrice);
    if (Number.isFinite(fixed) && fixed > 0) return fixed;
  }
  for (const key of ["CurrentBid", "StartingBid", "FixedPrice"] as const) {
    const v = Number(row[key]);
    if (Number.isFinite(v) && v > 0) return v;
  }
  return null;
}
