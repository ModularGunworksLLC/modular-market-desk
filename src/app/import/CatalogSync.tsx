"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { TRACKED_VENDORS, VENDOR_LABELS, type TrackedVendor } from "@/lib/tracked-vendors";

interface VendorStatus {
  ok: boolean;
  vendor: string;
  mode: string | null;
  hasApiToken: boolean;
  hasSession: boolean;
  hasFeedOrCatalogUrl: boolean;
  hasPreset: boolean;
  hasFirecrawlKey: boolean;
  issues: string[];
}

interface AllStatus {
  ok: boolean;
  vendors: VendorStatus[];
}

export function CatalogSync() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [pendingVendor, setPendingVendor] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [ok, setOk] = useState(true);
  const [status, setStatus] = useState<AllStatus | null>(null);

  function refreshStatus() {
    fetch("/api/catalogs/sync/status?vendor=all")
      .then((r) => r.json())
      .then((body) => setStatus(body as AllStatus))
      .catch(() => setStatus(null));
  }

  useEffect(() => {
    refreshStatus();
  }, []);

  function sync(vendor: string) {
    startTransition(async () => {
      setMsg(null);
      setPendingVendor(vendor);
      try {
        const res = await fetch("/api/catalogs/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ vendor }),
        });
        const body = (await res.json()) as {
          ok?: boolean;
          error?: string;
          upserted?: number;
          parsed?: number;
          skipped?: number;
          markedOutOfStock?: number;
          mode?: string;
          results?: Array<{
            vendor: string;
            ok: boolean;
            error?: string;
            result?: { upserted?: number; markedOutOfStock?: number; mode?: string };
          }>;
        };
        if (!res.ok && !body.results) {
          setOk(false);
          setMsg(body.error ?? `HTTP ${res.status}`);
          return;
        }
        if (body.results) {
          const lines = body.results.map((r) => {
            if (!r.ok) return `${r.vendor}: ${r.error ?? "failed"}`;
            return `${r.vendor}: ${r.result?.upserted ?? 0} upserted, ${r.result?.markedOutOfStock ?? 0} marked OOS (${r.result?.mode})`;
          });
          setOk(Boolean(body.ok));
          setMsg(lines.join(" · "));
        } else {
          setOk(true);
          setMsg(
            `Synced ${body.upserted ?? 0} rows (${body.parsed ?? 0} parsed, ${body.skipped ?? 0} skipped, ${body.markedOutOfStock ?? 0} marked OOS) via ${body.mode ?? "sync"}.`,
          );
        }
        refreshStatus();
        router.refresh();
      } catch (err) {
        setOk(false);
        setMsg(err instanceof Error ? err.message : String(err));
      } finally {
        setPendingVendor(null);
      }
    });
  }

  const byVendor = new Map((status?.vendors ?? []).map((v) => [v.vendor, v]));

  return (
    <section className="panel">
      <h2 className="mb-3 text-sm font-semibold text-desk-muted">Vendor catalog sync</h2>
      <p className="mb-3 text-sm text-desk-muted">
        Pulls the full sellable catalog your dealer accounts are authorized for — Lipsey&apos;s
        Integration API, CSV feeds, or Firecrawl portal scrape with vaulted session cookies — then
        upserts into the local catalog and marks missing SKUs out of stock.
      </p>

      <ul className="mb-3 space-y-2">
        {TRACKED_VENDORS.map((vendor) => {
          const st = byVendor.get(vendor);
          const ready = st?.ok ?? false;
          return (
            <li
              key={vendor}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-desk-border bg-desk-panel2 px-3 py-2 text-sm"
            >
              <div className="min-w-0">
                <div className="font-medium">{VENDOR_LABELS[vendor as TrackedVendor]}</div>
                <div className="text-[11px] text-desk-muted">
                  {st?.mode ?? "—"}
                  {st?.hasApiToken ? " · api" : ""}
                  {st?.hasSession ? " · session" : ""}
                  {st?.hasFirecrawlKey ? " · firecrawl" : ""}
                </div>
                {st && !ready && st.issues[0] && (
                  <div className="mt-0.5 text-[11px] text-desk-nogo">{st.issues[0]}</div>
                )}
              </div>
              <button
                type="button"
                onClick={() => sync(vendor)}
                disabled={pending}
                className="shrink-0 rounded-md border border-desk-border px-2.5 py-1 text-xs font-medium hover:border-desk-accent disabled:opacity-50"
              >
                {pendingVendor === vendor ? "Syncing…" : "Sync"}
              </button>
            </li>
          );
        })}
      </ul>

      <button
        type="button"
        onClick={() => sync("all")}
        disabled={pending}
        className="w-full rounded-md border border-desk-border bg-desk-panel2 px-3 py-2 text-sm font-medium hover:border-desk-accent disabled:opacity-50"
      >
        {pendingVendor === "all" ? "Syncing all vendors…" : "Sync all vendors with credentials"}
      </button>
      {msg && <p className={`mt-2 text-sm ${ok ? "text-desk-go" : "text-desk-nogo"}`}>{msg}</p>}
      <p className="mt-2 text-[11px] text-desk-muted">
        Vault: Lipsey&apos;s <code>market_api</code> Token; others <code>vendor_session</code> Cookie
        (and optional catalog/CSV URL). Set <code>FIRECRAWL_API_KEY</code> for portal sync.
      </p>
    </section>
  );
}
