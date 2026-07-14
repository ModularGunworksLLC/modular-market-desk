"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { API_SYNC_VENDORS, vendorLabel } from "@/lib/tracked-vendors";

interface SyncStatus {
  ok: boolean;
  hasToken: boolean;
  hasSid?: boolean;
  hasFeedUrl: boolean;
  hasPreset: boolean;
  credentialSource?: string | null;
  issues: string[];
}

type SyncVendor = (typeof API_SYNC_VENDORS)[number];

export function CatalogSync() {
  const router = useRouter();
  const [vendor, setVendor] = useState<SyncVendor>("chattanooga");
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [ok, setOk] = useState(true);
  const [status, setStatus] = useState<SyncStatus | null>(null);

  useEffect(() => {
    setStatus(null);
    setMsg(null);
    fetch(`/api/catalogs/sync/status?vendor=${encodeURIComponent(vendor)}`)
      .then((r) => r.json())
      .then((body) => setStatus(body as SyncStatus))
      .catch(() => setStatus(null));
  }, [vendor]);

  function sync() {
    startTransition(async () => {
      setMsg(null);
      try {
        const res = await fetch("/api/catalogs/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ vendor }),
        });
        const body = (await res.json()) as {
          ok?: boolean;
          error?: string;
          parsed?: number;
          upserted?: number;
          skipped?: number;
        };
        if (!res.ok) {
          setOk(false);
          setMsg(body.error ?? `HTTP ${res.status}`);
          return;
        }
        setOk(true);
        setMsg(`Synced ${body.upserted ?? 0} rows (${body.parsed ?? 0} parsed, ${body.skipped ?? 0} skipped).`);
        fetch(`/api/catalogs/sync/status?vendor=${encodeURIComponent(vendor)}`)
          .then((r) => r.json())
          .then((s) => setStatus(s as SyncStatus))
          .catch(() => undefined);
        router.refresh();
      } catch (err) {
        setOk(false);
        setMsg(err instanceof Error ? err.message : String(err));
      }
    });
  }

  return (
    <section className="panel">
      <h2 className="mb-3 text-sm font-semibold text-desk-muted">API catalog sync</h2>
      <p className="mb-3 text-sm text-desk-muted">
        Pull live dealer catalogs into SQLite for wholesale floors on Evaluate. Chattanooga uses your
        CSSI API SID/token; 2AW uses the CSV feed URL.
      </p>

      <label className="field-label">Vendor</label>
      <select
        className="field-input mb-3"
        value={vendor}
        onChange={(e) => setVendor(e.target.value as SyncVendor)}
      >
        {API_SYNC_VENDORS.map((v) => (
          <option key={v} value={v}>
            {vendorLabel(v)}
          </option>
        ))}
      </select>

      {status && !status.ok && (
        <ul className="mb-3 list-inside list-disc text-sm text-desk-nogo">
          {status.issues.map((issue) => (
            <li key={issue}>{issue}</li>
          ))}
        </ul>
      )}
      {status?.ok && (
        <p className="mb-3 text-sm text-desk-go">
          Ready
          {vendor === "chattanooga" && status.credentialSource
            ? ` — credentials from ${status.credentialSource}`
            : " — token / feed configured"}
          .
        </p>
      )}
      <button
        type="button"
        onClick={sync}
        disabled={pending}
        className="w-full rounded-md border border-desk-border bg-desk-panel2 px-3 py-2 text-sm font-medium hover:border-desk-accent disabled:opacity-50"
      >
        {pending ? "Syncing catalog..." : `Sync ${vendorLabel(vendor)}`}
      </button>
      {msg && <p className={`mt-2 text-sm ${ok ? "text-desk-go" : "text-desk-nogo"}`}>{msg}</p>}
      <p className="mt-2 text-[11px] text-desk-muted">
        Chattanooga: vault vendor <code>chattanooga</code>, paste API token + SID (or{" "}
        <code>CHATTANOOGA_API_SID</code> / <code>CHATTANOOGA_API_TOKEN</code> in <code>.env</code>). 2AW:
        vendor <code>2ndamendmentwholesale</code> + feed URL.
      </p>
    </section>
  );
}
