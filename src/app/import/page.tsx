import Link from "next/link";
import {
  getCatalogSummaries,
  listConnections,
  listPresets,
  type CatalogSummary,
  type ConnectionView,
} from "@/lib/catalog-queries";
import type { CsvPreset } from "@/lib/db/schema";
import { intFmt, timeAgo, usd } from "@/lib/format";

import { CatalogSync } from "./CatalogSync";
import { CatalogUploader } from "./CatalogUploader";
import { ConnectionVault } from "./ConnectionVault";
import { MarketDataBankSync } from "./MarketDataBankSync";
import { OaCatalogSync } from "./OaCatalogSync";
import { PresetPanel } from "./PresetPanel";

export const dynamic = "force-dynamic";

async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<{ data: T; error: string | null }> {
  try {
    return { data: await fn(), error: null };
  } catch (err) {
    return { data: fallback, error: (err as Error).message };
  }
}

export default async function ImportDashboard() {
  const [summaries, presets, conns] = await Promise.all([
    safe<CatalogSummary[]>(getCatalogSummaries, []),
    safe<CsvPreset[]>(listPresets, []),
    safe<ConnectionView[]>(listConnections, []),
  ]);

  const dbError = summaries.error ?? presets.error ?? conns.error;
  const vendorOptions = presets.data.map((p) => ({ value: p.vendorName, label: p.label }));

  return (
    <main className="mx-auto max-w-[1800px] px-4 py-6">
      <div className="mb-6">
        <h1 className="text-lg font-semibold tracking-tight">Ingestion Dashboard</h1>
        <p className="text-xs text-desk-muted">
          Catalogs &amp; Session Vault ·{" "}
          <Link href="/catalog" className="text-desk-accent hover:underline">
            Search master catalog →
          </Link>
        </p>
      </div>

      {dbError && (
        <div className="panel mb-4 border-desk-nogo">
          <p className="text-sm text-desk-nogo">Database not reachable: {dbError}</p>
          <p className="mt-1 text-xs text-desk-muted">
            Set <code>DATABASE_URL</code> in <code>.env</code> and run <code>npm run db:push</code>.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        {/* Catalog summary across distributors */}
        <section className="panel xl:col-span-2">
          <h2 className="mb-3 text-sm font-semibold text-desk-muted">Distributor catalogs</h2>
          {summaries.data.length === 0 ? (
            <p className="text-sm text-desk-muted">No catalogs imported yet. Upload a CSV to begin.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead className="text-left text-xs uppercase text-desk-muted">
                  <tr>
                    <th className="py-1">Distributor</th>
                    <th>Items</th>
                    <th>In stock</th>
                    <th>On sale</th>
                    <th>Cheapest</th>
                    <th>Last import</th>
                  </tr>
                </thead>
                <tbody className="num">
                  {summaries.data.map((s) => (
                    <tr key={s.vendorName} className="border-t border-desk-border">
                      <td className="py-1.5 font-sans capitalize">{s.vendorName}</td>
                      <td>{intFmt(s.items)}</td>
                      <td>{intFmt(s.inStock)}</td>
                      <td>{intFmt(s.onSale)}</td>
                      <td>{usd(s.cheapest)}</td>
                      <td className="font-sans text-desk-muted">{timeAgo(s.lastImport)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Presets */}
        <PresetPanel presets={presets.data.map((p) => ({ vendorName: p.vendorName, label: p.label }))} />

        {/* Uploader */}
        <section className="panel xl:col-span-2">
          <h2 className="mb-3 text-sm font-semibold text-desk-muted">Bulk CSV import</h2>
          <CatalogUploader vendors={vendorOptions} />
        </section>

        {/* API sync */}
        <CatalogSync />

        {/* Session Vault */}
        <ConnectionVault connections={conns.data} />

        {/* Outdoor Analytics full brand/model catalog */}
        <OaCatalogSync />

        {/* Weekly market data bank (OA + street asks) */}
        <MarketDataBankSync />
      </div>
    </main>
  );
}
