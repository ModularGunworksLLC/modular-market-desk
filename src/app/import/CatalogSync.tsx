"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

interface SyncStatus {
  ok: boolean;
  hasToken: boolean;
  hasFeedUrl: boolean;
  hasPreset: boolean;
  issues: string[];
}

export function CatalogSync() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [ok, setOk] = useState(true);
  const [status, setStatus] = useState<SyncStatus | null>(null);

  useEffect(() => {
    fetch("/api/catalogs/sync/status?vendor=2ndamendmentwholesale")
      .then((r) => r.json())
      .then((body) => setStatus(body as SyncStatus))
      .catch(() => setStatus(null));
  }, []);

  function sync() {
    startTransition(async () => {
      setMsg(null);
      try {
        const res = await fetch("/api/catalogs/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ vendor: "2ndamendmentwholesale" }),
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
        fetch("/api/catalogs/sync/status?vendor=2ndamendmentwholesale")
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
      <h2 className="mb-3 text-sm font-semibold text-desk-muted">2AW API catalog sync</h2>
      <p className="mb-3 text-sm text-desk-muted">
        Pulls the dealer CSV feed using your Session Vault token + feed URL, then upserts into the
        local catalog for dealer-floor comparisons and the deal scanner.
      </p>
      {status && !status.ok && (
        <ul className="mb-3 list-inside list-disc text-sm text-desk-nogo">
          {status.issues.map((issue) => (
            <li key={issue}>{issue}</li>
          ))}
        </ul>
      )}
      {status?.ok && (
        <p className="mb-3 text-sm text-desk-go">Ready — token, feed URL, and CSV preset are configured.</p>
      )}
      <button
        type="button"
        onClick={sync}
        disabled={pending}
        className="w-full rounded-md border border-desk-border bg-desk-panel2 px-3 py-2 text-sm font-medium hover:border-desk-accent disabled:opacity-50"
      >
        {pending ? "Syncing feed..." : "Sync 2nd Amendment Wholesale"}
      </button>
      {msg && <p className={`mt-2 text-sm ${ok ? "text-desk-go" : "text-desk-nogo"}`}>{msg}</p>}
      <p className="mt-2 text-[11px] text-desk-muted">
        Vault: vendor <code>2ndamendmentwholesale</code>, kind <code>market_api</code>, plus the feed
        URL 2AW emailed you. Or set <code>TAW_FEED_URL</code> in <code>.env</code>.
      </p>
    </section>
  );
}
