/**
 * Lipsey's Integration API.
 * Auth: POST Login (email/password) → session Token header on later calls.
 * Catalog: GET CatalogFeed (full identity + dealer price/qty; cached ~4h server-side).
 * Ordering / dropship / shipping are not used by the desk.
 */

import { round2 } from "@/lib/arbitrage/fees";
import { redactSecrets } from "@/lib/vault";

const DEFAULT_BASE = process.env.LIPSEYS_API_BASE ?? "https://api.lipseys.com";
const DEFAULT_TIMEOUT_MS = 180_000;

export class LipseysApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "LipseysApiError";
  }
}

/** Envelope returned by most Lipsey's endpoints. */
export interface LipseysEnvelope<T> {
  success?: boolean;
  authorized?: boolean;
  errors?: string[];
  data?: T;
}

export interface LipseysLoginEcontact {
  name?: string;
  email?: string;
  cusNo?: string;
  shipTo?: string;
  locationName?: string;
  slm?: string;
}

export interface LipseysLoginResponse {
  token?: string;
  econtact?: LipseysEnvelope<LipseysLoginEcontact>;
}

/** Raw CatalogFeed row (fields vary slightly; we read defensively). */
export interface LipseysCatalogItem {
  itemNo?: string;
  itemNumber?: string;
  description1?: string;
  description2?: string;
  upc?: string;
  manufacturerModelNo?: string;
  mfgModelNumber?: string;
  msrp?: number | string;
  model?: string;
  caliberGauge?: string;
  manufacturer?: string;
  type?: string;
  itemType?: string;
  quantity?: number | string;
  allocated?: boolean;
  onSale?: boolean;
  price?: number | string;
  currentPrice?: number | string;
  retailMap?: number | string;
  [key: string]: unknown;
}

export interface MappedLipseysItem {
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
  salePrice: number | null;
  onSale: boolean;
  qty: number | null;
  inStock: boolean;
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

function money(value: unknown): number | null {
  const n = asNumber(value);
  if (n == null || n <= 0) return null;
  return round2(n);
}

function joinErrors(errors: unknown): string {
  if (!Array.isArray(errors)) return "";
  return errors
    .filter((e): e is string => typeof e === "string" && e.trim().length > 0)
    .join("; ");
}

export function unwrapEnvelope<T>(body: LipseysEnvelope<T>, label: string): T {
  const errText = joinErrors(body.errors);
  if (body.authorized === false) {
    throw new LipseysApiError(
      errText || `${label}: not authorized — check Lipsey's email/password and IP whitelist.`,
      401,
    );
  }
  if (body.success === false) {
    throw new LipseysApiError(errText || `${label} failed.`, 502);
  }
  if (body.data === undefined || body.data === null) {
    throw new LipseysApiError(errText || `${label}: empty data.`, 502);
  }
  return body.data;
}

/** Dealer cost: live currentPrice (CSV CURRENTPRICE), else list price. */
export function resolveLipseysDealerPrice(item: LipseysCatalogItem): number | null {
  return money(item.currentPrice) ?? money(item.price);
}

export function mapLipseysCatalogItem(item: LipseysCatalogItem): MappedLipseysItem | null {
  const dealerPrice = resolveLipseysDealerPrice(item);
  if (dealerPrice == null) return null;

  const sku = asString(item.itemNo ?? item.itemNumber) || null;
  let upc = asString(item.upc) || null;
  if (upc) upc = upc.replace(/^#+|#+$/g, "").trim() || null;
  if (!sku && !upc) return null;

  const description = asString(item.description1) || null;
  const manufacturer = asString(item.manufacturer) || "Unknown";
  const model =
    asString(item.model) ||
    asString(item.manufacturerModelNo ?? item.mfgModelNumber) ||
    description ||
    sku ||
    upc ||
    "Unknown";

  const listPrice = money(item.price);
  const current = money(item.currentPrice);
  const onSale =
    item.onSale === true || (current != null && listPrice != null && current < listPrice);
  const salePrice = onSale ? (current ?? dealerPrice) : null;

  const qtyRaw = asNumber(item.quantity);
  const qty = qtyRaw == null ? null : Math.max(0, Math.trunc(qtyRaw));
  const inStock = qty == null ? true : qty > 0;

  return {
    sku,
    upc,
    manufacturer,
    model,
    description,
    caliber: asString(item.caliberGauge) || null,
    category: asString(item.type) || asString(item.itemType) || null,
    dealerPrice,
    msrp: money(item.msrp),
    mapPrice: money(item.retailMap),
    salePrice,
    onSale,
    qty,
    inStock,
  };
}

export class LipseysApiClient {
  private readonly email: string;
  private readonly password: string;
  private readonly base: string;
  private token: string | null = null;

  constructor(opts: { email: string; password: string; baseUrl?: string }) {
    this.email = opts.email.trim();
    this.password = opts.password;
    if (!this.email || !this.password) {
      throw new LipseysApiError("Missing Lipsey's API email or password");
    }
    this.base = (opts.baseUrl ?? DEFAULT_BASE).replace(/\/$/, "");
  }

  private url(path: string): string {
    return `${this.base}${path.startsWith("/") ? path : `/${path}`}`;
  }

  private async request(opts: {
    method: "GET" | "POST";
    path: string;
    body?: unknown;
    withToken?: boolean;
    timeoutMs?: number;
  }): Promise<unknown> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    const headers: Record<string, string> = {
      Accept: "application/json",
    };
    if (opts.body !== undefined) headers["Content-Type"] = "application/json";
    if (opts.withToken) {
      if (!this.token) throw new LipseysApiError("Lipsey's session token missing — login first.");
      headers.Token = this.token;
    }

    let res: Response;
    try {
      res = await fetch(this.url(opts.path), {
        method: opts.method,
        headers,
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
        signal: ctrl.signal,
        cache: "no-store",
      });
    } catch (err) {
      throw new LipseysApiError(`Request failed: ${redactSecrets((err as Error).message)}`);
    } finally {
      clearTimeout(timer);
    }

    const text = await res.text();
    let json: unknown = null;
    if (text) {
      try {
        json = JSON.parse(text) as unknown;
      } catch {
        json = null;
      }
    }

    if (res.status === 401 || res.status === 403) {
      throw new LipseysApiError(
        "Unauthorized — check Lipsey's email/password in Session Vault and that Lightsail IP 3.22.205.235 is whitelisted.",
        res.status,
      );
    }
    if (!res.ok) {
      const preview = redactSecrets(text).slice(0, 200);
      throw new LipseysApiError(`HTTP ${res.status}: ${preview || "empty body"}`, res.status);
    }
    if (json == null) {
      throw new LipseysApiError(`HTTP ${res.status}: response was not JSON`, res.status);
    }
    return json;
  }

  async login(): Promise<string> {
    const json = (await this.request({
      method: "POST",
      path: "/api/Integration/Authentication/Login",
      body: { Email: this.email, Password: this.password },
      timeoutMs: 30_000,
    })) as LipseysLoginResponse;

    const token = typeof json.token === "string" ? json.token.trim() : "";
    if (!token) {
      const errText = joinErrors(json.econtact?.errors);
      throw new LipseysApiError(
        errText || "Lipsey's login returned no token. Check email/password and IP whitelist.",
        401,
      );
    }
    if (json.econtact && json.econtact.success === false) {
      throw new LipseysApiError(joinErrors(json.econtact.errors) || "Lipsey's login failed.", 401);
    }
    this.token = token;
    return token;
  }

  /** Full catalog with identity + dealer price/qty. Cached ~4h on Lipsey's side. */
  async fetchCatalogFeed(): Promise<LipseysCatalogItem[]> {
    if (!this.token) await this.login();
    const json = (await this.request({
      method: "GET",
      path: "/api/Integration/Items/CatalogFeed",
      withToken: true,
    })) as LipseysEnvelope<LipseysCatalogItem[] | { items?: LipseysCatalogItem[] }>;

    const data = unwrapEnvelope(json, "CatalogFeed");
    if (Array.isArray(data)) return data;
    if (data && Array.isArray(data.items)) return data.items;
    throw new LipseysApiError("CatalogFeed: unexpected data shape.", 502);
  }
}
