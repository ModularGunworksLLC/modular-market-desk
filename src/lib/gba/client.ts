/**
 * GunBroker Analytics (Outdoor Analytics) portal API client.
 * Bearer-authenticated, called directly from Lightsail. Token comes from the Session Vault.
 *
 *   GET /pricing/data            -> historical SOLD rows
 *   GET /pricing/active-listings -> active ASKING rows
 */

import { summarize } from "@/lib/arbitrage/stats";
import type { PriceStats } from "@/lib/arbitrage/types";
import { resolveSelection } from "@/lib/gba/scorer";
import type { GbaQuery, OaDependencies, OaSelection } from "@/lib/gba/scorer";

const DEFAULT_BASE = process.env.GBA_API_BASE ?? "https://api.gunbrokeranalytics.com/gba-portal-api";
const DEFAULT_TIMEOUT_MS = 180_000;

export class GbaApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "GbaApiError";
  }
}

export interface GbaMarket {
  sold: PriceStats;
  asking: PriceStats;
  soldRaw: number[];
  askingRaw: number[];
}

export class GbaApiClient {
  private readonly token: string;
  private readonly base: string;

  constructor(token: string, opts?: { baseUrl?: string }) {
    this.token = token.trim();
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
      throw new GbaApiError(`Request failed: ${(err as Error).message}`);
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

  /** Catalog dependency tree keyed by condition bucket (NEW / USED). */
  async dependencies(): Promise<OaDependencies> {
    const data = await this.get<OaDependencies>("/pricing/dependencies");
    return data && typeof data === "object" ? data : {};
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
    const selection = await this.resolve(query);
    if (!selection) return null;
    const market = await this.market({
      modelId: selection.modelId,
      caliberId: selection.caliberId,
      condition: selection.conditionParam,
    });
    return { ...market, selection };
  }

  /** Historical SOLD prices for a resolved model/caliber. */
  async pricingData(args: { modelId: number; caliberId: number; condition: "New" | "Used" }): Promise<number[]> {
    const rows = await this.get<Array<Record<string, unknown>>>("/pricing/data", {
      modelID: args.modelId,
      caliberID: args.caliberId,
      condition: args.condition,
    });
    if (!Array.isArray(rows)) return [];
    return rows
      .map((r) => Number(r.Amount))
      .filter((n) => Number.isFinite(n) && n > 0);
  }

  /** Active ASKING prices for a resolved model/caliber. */
  async activeListings(args: { modelId: number; caliberId: number; useParentModel?: boolean }): Promise<number[]> {
    const rows = await this.get<Array<Record<string, unknown>>>("/pricing/active-listings", {
      modelID: args.modelId,
      caliberID: args.caliberId,
      useParentModel: args.useParentModel === false ? "0" : "1",
    });
    if (!Array.isArray(rows)) return [];
    return rows.map(activeListingPrice).filter((n): n is number => n != null && n > 0);
  }

  /** Pull both sold + asking sets and summarize into percentile stats. */
  async market(args: { modelId: number; caliberId: number; condition: "New" | "Used" }): Promise<GbaMarket> {
    const [soldRaw, askingRaw] = await Promise.all([
      this.pricingData(args),
      this.activeListings({ modelId: args.modelId, caliberId: args.caliberId }),
    ]);
    return {
      soldRaw,
      askingRaw,
      sold: summarize(soldRaw),
      asking: summarize(askingRaw),
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
