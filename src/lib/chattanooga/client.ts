/**
 * Chattanooga Shooting Supplies dealer REST API (v4).
 * Auth matches the Modular Gunworks site sync: SID + MD5(token) as Basic credentials.
 */

import { createHash } from "node:crypto";

import { redactSecrets } from "@/lib/vault";

const DEFAULT_BASE = process.env.CHATTANOOGA_API_BASE ?? "https://api.chattanoogashooting.com/rest/v4";
const DEFAULT_TIMEOUT_MS = 120_000;
const PAGE_SIZE = 200;

export class ChattanoogaApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "ChattanoogaApiError";
  }
}

/** Raw item shape from GET /items (fields vary; we read defensively). */
export interface ChattanoogaApiItem {
  cssi_id?: string | number;
  id?: string | number;
  upc_code?: string;
  upc?: string;
  name?: string;
  brand?: string;
  manufacturer?: string;
  category?: string;
  subcategory?: string;
  department?: string;
  caliber?: string;
  /** Dealer cost when present. */
  dealer_price?: string | number;
  price?: string | number;
  cost?: string | number;
  customer_price?: string | number;
  unit_price?: string | number;
  wholesale_price?: string | number;
  /** Often MSRP on dealer feeds; website storefront treated this as display MSRP. */
  retail_price?: string | number;
  msrp?: string | number;
  map_price?: string | number;
  inventory?: string | number;
  in_stock_flag?: string | number | boolean;
  ffl_flag?: string | number | boolean;
  serialized_flag?: string | number | boolean;
  discontinued?: string | number | boolean;
  [key: string]: unknown;
}

interface ItemsPage {
  items?: ChattanoogaApiItem[];
  pagination?: {
    total_pages?: number;
    current_page?: number;
    per_page?: number;
  };
}

function authHeader(sid: string, token: string): string {
  const tokenHash = createHash("md5").update(token).digest("hex");
  // Match working Modular Gunworks site client (non-base64 Basic form accepted by CSSI).
  return `Basic ${sid}:${tokenHash}`;
}

function asNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(String(value).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function asString(value: unknown): string {
  if (value == null) return "";
  return String(value).trim();
}

function truthyFlag(value: unknown): boolean {
  return value === 1 || value === true || value === "1" || value === "Y" || value === "y" || value === "true";
}

/** Prefer explicit dealer-cost fields; fall back to retail_price (common on CSSI dealer feeds). */
export function resolveDealerPrice(item: ChattanoogaApiItem): number | null {
  const candidates = [
    item.dealer_price,
    item.wholesale_price,
    item.customer_price,
    item.unit_price,
    item.cost,
    item.price,
    item.retail_price,
  ];
  for (const c of candidates) {
    const n = asNumber(c);
    if (n != null && n > 0) return Math.round(n * 100) / 100;
  }
  return null;
}

export function mapChattanoogaItem(item: ChattanoogaApiItem): {
  sku: string | null;
  upc: string | null;
  manufacturer: string;
  model: string;
  description: string | null;
  caliber: string | null;
  category: string | null;
  dealerPrice: number;
  msrp: number | null;
  mapPrice: number | null;
  qty: number | null;
  inStock: boolean;
} | null {
  const dealerPrice = resolveDealerPrice(item);
  if (dealerPrice == null) return null;

  const sku = asString(item.cssi_id ?? item.id) || null;
  let upc = asString(item.upc_code ?? item.upc) || null;
  if (upc) upc = upc.replace(/^#+|#+$/g, "").trim() || null;
  if (!sku && !upc) return null;

  const description = asString(item.name) || null;
  const manufacturer = asString(item.brand ?? item.manufacturer) || description?.split(/\s+/)[0] || "Unknown";
  const model = description || sku || upc || "Unknown";
  const qtyRaw = asNumber(item.inventory);
  const qty = qtyRaw == null ? null : Math.max(0, Math.trunc(qtyRaw));
  const inStock = item.in_stock_flag != null ? truthyFlag(item.in_stock_flag) : qty == null ? true : qty > 0;

  const msrp = asNumber(item.msrp) ?? asNumber(item.retail_price);
  const mapPrice = asNumber(item.map_price);
  const category =
    asString(item.department) || asString(item.category) || asString(item.subcategory) || null;

  return {
    sku,
    upc,
    manufacturer,
    model,
    description,
    caliber: asString(item.caliber) || null,
    category,
    dealerPrice,
    msrp: msrp != null && msrp > 0 ? Math.round(msrp * 100) / 100 : null,
    mapPrice: mapPrice != null && mapPrice > 0 ? Math.round(mapPrice * 100) / 100 : null,
    qty,
    inStock,
  };
}

export class ChattanoogaApiClient {
  private readonly sid: string;
  private readonly token: string;
  private readonly base: string;

  constructor(opts: { sid: string; token: string; baseUrl?: string }) {
    this.sid = opts.sid.trim();
    this.token = opts.token.trim();
    if (!this.sid || !this.token) {
      throw new ChattanoogaApiError("Missing Chattanooga API SID or token");
    }
    this.base = (opts.baseUrl ?? DEFAULT_BASE).replace(/\/$/, "");
  }

  private async getPage(page: number): Promise<ItemsPage> {
    const url = new URL(`${this.base}/items`);
    url.searchParams.set("page", String(page));
    url.searchParams.set("per_page", String(PAGE_SIZE));

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), DEFAULT_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(url, {
        method: "GET",
        headers: {
          Authorization: authHeader(this.sid, this.token),
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        signal: ctrl.signal,
        cache: "no-store",
      });
    } catch (err) {
      throw new ChattanoogaApiError(`Request failed: ${redactSecrets((err as Error).message)}`);
    } finally {
      clearTimeout(timer);
    }

    if (res.status === 401 || res.status === 403) {
      throw new ChattanoogaApiError(
        "Unauthorized — check Chattanooga API SID/token in Session Vault or env.",
        res.status,
      );
    }
    if (!res.ok) {
      throw new ChattanoogaApiError(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`, res.status);
    }

    return (await res.json()) as ItemsPage;
  }

  /** Paginate the full dealer catalog. */
  async fetchAllItems(onPage?: (page: number, count: number) => void): Promise<ChattanoogaApiItem[]> {
    const all: ChattanoogaApiItem[] = [];
    let page = 1;
    let totalPages = 1;

    while (page <= totalPages) {
      const data = await this.getPage(page);
      const items = Array.isArray(data.items) ? data.items : [];
      all.push(...items);
      onPage?.(page, items.length);

      const reported = data.pagination?.total_pages;
      if (typeof reported === "number" && reported > 0) {
        totalPages = reported;
      } else if (items.length < PAGE_SIZE) {
        break;
      } else {
        totalPages = page + 1;
      }
      page += 1;
    }

    return all;
  }
}
