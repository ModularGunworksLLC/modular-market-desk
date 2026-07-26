"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import type { CatalogProductGroup } from "@/lib/catalog-search";
import { PARTS_KEYWORD_FACETS } from "@/lib/catalog-search";
import { usd } from "@/lib/format";
import { vendorLabel } from "@/lib/tracked-vendors";

type SearchResponse = {
  ok: boolean;
  error?: string;
  q: string;
  groups: CatalogProductGroup[];
  rowCount: number;
  groupCount: number;
  categories: string[];
  vendors: string[];
  partsFacets?: typeof PARTS_KEYWORD_FACETS;
};

function evaluateHref(g: CatalogProductGroup): string {
  const params = new URLSearchParams();
  if (g.upc) params.set("upc", g.upc);
  if (g.manufacturer) params.set("manufacturer", g.manufacturer);
  if (g.model) params.set("model", g.model);
  if (g.caliber) params.set("caliber", g.caliber);
  const price = g.bestOffer.effectivePrice;
  if (price > 0) params.set("targetAcquisitionCost", String(price));
  params.set("workflow", "vendor");
  return `/evaluate?${params.toString()}`;
}

type SearchOverrides = Partial<{
  q: string;
  vendor: string;
  category: string;
  inStockOnly: boolean;
  markSearched: boolean;
}>;

export function CatalogSearchClient() {
  const [q, setQ] = useState("");
  const [vendor, setVendor] = useState("");
  const [category, setCategory] = useState("");
  const [inStockOnly, setInStockOnly] = useState(true);
  const [data, setData] = useState<SearchResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [searched, setSearched] = useState(false);

  const runSearch = useCallback(
    async (overrides?: SearchOverrides) => {
      const nextQ = overrides?.q ?? q;
      const nextVendor = overrides?.vendor ?? vendor;
      const nextCategory = overrides?.category ?? category;
      const nextStock = overrides?.inStockOnly ?? inStockOnly;
      const markSearched = overrides?.markSearched ?? true;

      setPending(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        if (nextQ.trim()) params.set("q", nextQ.trim());
        if (nextVendor) params.set("vendor", nextVendor);
        if (nextCategory) params.set("category", nextCategory);
        if (nextStock) params.set("inStockOnly", "1");
        params.set("limit", "40");

        const res = await fetch(`/api/catalogs/search?${params.toString()}`);
        const body = (await res.json()) as SearchResponse;
        if (!res.ok || body.ok === false) {
          setError(body.error ?? `HTTP ${res.status}`);
          setData(null);
          return;
        }
        setData(body);
        if (markSearched) {
          setSearched(Boolean(nextQ.trim() || nextVendor || nextCategory || nextStock));
        }
      } catch (err) {
        setError((err as Error).message || "Search failed");
        setData(null);
      } finally {
        setPending(false);
      }
    },
    [q, vendor, category, inStockOnly],
  );

  useEffect(() => {
    void runSearch({ q: "", vendor: "", category: "", inStockOnly: false, markSearched: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount once for facets
  }, []);

  const categories = data?.categories ?? [];
  const vendors = data?.vendors ?? [];
  const groups = data?.groups ?? [];
  const hasActiveSearch = searched;

  return (
    <div className="space-y-4">
      <form
        className="panel space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          void runSearch();
        }}
      >
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
          <label className="min-w-0 flex-1">
            <span className="field-label">Search master catalog</span>
            <input
              className="field-input font-mono text-sm"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="UPC, SKU, make, model, BCG, barrel…"
              autoFocus
            />
          </label>
          <label className="w-full lg:w-44">
            <span className="field-label">Vendor</span>
            <select
              className="field-input"
              value={vendor}
              onChange={(e) => {
                const v = e.target.value;
                setVendor(v);
                void runSearch({ vendor: v });
              }}
            >
              <option value="">All vendors</option>
              {vendors.map((v) => (
                <option key={v} value={v}>
                  {vendorLabel(v)}
                </option>
              ))}
            </select>
          </label>
          <label className="w-full lg:w-52">
            <span className="field-label">Category</span>
            <select
              className="field-input"
              value={category}
              onChange={(e) => {
                const c = e.target.value;
                setCategory(c);
                void runSearch({ category: c });
              }}
            >
              <option value="">All categories</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 pb-2 text-xs text-desk-muted">
            <input
              type="checkbox"
              checked={inStockOnly}
              onChange={(e) => {
                const checked = e.target.checked;
                setInStockOnly(checked);
                void runSearch({ inStockOnly: checked });
              }}
            />
            In stock only
          </label>
          <button
            type="submit"
            className="shrink-0 rounded-md bg-desk-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            disabled={pending}
          >
            {pending ? "Searching…" : "Search"}
          </button>
        </div>

        <div className="flex flex-wrap gap-1.5">
          <span className="mr-1 self-center text-[10px] uppercase tracking-wide text-desk-muted">
            Parts
          </span>
          {PARTS_KEYWORD_FACETS.map((f) => (
            <button
              key={f.id}
              type="button"
              className={`rounded-md border px-2 py-1 text-xs transition ${
                q.trim().toLowerCase() === f.q.toLowerCase()
                  ? "border-desk-accent bg-desk-accent/20 text-desk-text"
                  : "border-desk-border text-desk-muted hover:border-desk-accent/50 hover:text-desk-text"
              }`}
              onClick={() => {
                setQ(f.q);
                void runSearch({ q: f.q });
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
      </form>

      {error && (
        <div className="panel border-desk-nogo text-sm text-desk-nogo">{error}</div>
      )}

      {data && hasActiveSearch && (
        <p className="text-xs text-desk-muted">
          {data.groupCount} product{data.groupCount === 1 ? "" : "s"} · {data.rowCount} catalog row
          {data.rowCount === 1 ? "" : "s"}
          {pending ? " · updating…" : ""}
        </p>
      )}

      {!hasActiveSearch && !pending && (
        <p className="text-sm text-desk-muted">
          Type a UPC or keyword, pick a parts chip, or filter by category to compare distributor prices.
        </p>
      )}

      <div className="space-y-3">
        {groups.map((g) => (
          <article key={g.groupKey} className="panel overflow-hidden p-0">
            <div className="flex flex-wrap items-start justify-between gap-2 border-b border-desk-border bg-desk-panel2/40 px-3 py-2">
              <div className="min-w-0">
                <h2 className="text-sm font-semibold text-desk-text">{g.label}</h2>
                <p className="mt-0.5 font-mono text-xs text-desk-muted">
                  {[g.manufacturer, g.model, g.caliber].filter(Boolean).join(" · ")}
                  {g.upc ? ` · UPC ${g.upc}` : ""}
                  {g.category ? ` · ${g.category}` : ""}
                </p>
              </div>
              <div className="text-right">
                <div className="font-mono text-base font-semibold text-desk-go">
                  {usd(g.bestOffer.effectivePrice)}
                </div>
                <div className="text-[10px] uppercase tracking-wide text-desk-muted">
                  best @ {vendorLabel(g.bestOffer.vendorName)}
                  {g.bestOffer.inStock ? "" : " (OOS)"}
                </div>
                {g.priceSpread != null && g.priceSpread > 0 && (
                  <div className="font-mono text-[10px] text-desk-muted">
                    spread {usd(g.priceSpread)} · {g.vendorCount} vendors
                  </div>
                )}
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-sm">
                <thead className="text-left text-[10px] uppercase text-desk-muted">
                  <tr>
                    <th className="px-3 py-1.5">Vendor</th>
                    <th>SKU</th>
                    <th>Price</th>
                    <th>Stock</th>
                    <th />
                  </tr>
                </thead>
                <tbody className="font-mono">
                  {g.offers.map((o) => {
                    const isBest =
                      o.vendorName === g.bestOffer.vendorName
                      && o.effectivePrice === g.bestOffer.effectivePrice;
                    return (
                      <tr
                        key={`${o.vendorName}-${o.id}`}
                        className={`border-t border-desk-border ${isBest ? "bg-desk-go/5" : ""}`}
                      >
                        <td className="px-3 py-1.5 font-sans text-desk-text">
                          {vendorLabel(o.vendorName)}
                          {isBest && (
                            <span className="ml-1.5 text-[10px] font-semibold uppercase text-desk-go">
                              best
                            </span>
                          )}
                        </td>
                        <td className="text-desk-muted">{o.sku || "—"}</td>
                        <td className={isBest ? "font-semibold text-desk-go" : ""}>
                          {usd(o.effectivePrice)}
                          {o.onSale && o.salePrice != null && (
                            <span className="ml-1 text-[10px] text-desk-muted">sale</span>
                          )}
                        </td>
                        <td>
                          {o.inStock
                            ? o.qty != null
                              ? `qty ${o.qty}`
                              : "in stock"
                            : "—"}
                        </td>
                        <td className="px-3 py-1.5 text-right font-sans">
                          {isBest && (
                            <Link
                              href={evaluateHref(g)}
                              className="text-xs text-desk-accent hover:underline"
                            >
                              Evaluate
                            </Link>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </article>
        ))}
      </div>

      {hasActiveSearch && !pending && groups.length === 0 && !error && (
        <p className="text-sm text-desk-muted">
          No catalog hits. Refresh distributors on{" "}
          <Link href="/import" className="text-desk-accent hover:underline">
            Import
          </Link>
          .
        </p>
      )}
    </div>
  );
}
