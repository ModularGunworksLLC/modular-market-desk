"use client";

import { useCallback, useEffect, useState, useTransition } from "react";

type MarketSyncStatus = {
  running: boolean;
  activeRunId: string | null;
  lastRun: {
    id: string;
    status: string;
    startedAt: string | null;
    finishedAt: string | null;
    error: string | null;
    meta: Record<string, unknown>;
  } | null;
  bank: {
    askObservations: number;
    bySource: Record<string, number>;
  };
  error?: string;
};

function fmtWhen(d: string | null | undefined): string {
  if (!d) return "—";
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return "—";
  return dt.toLocaleString();
}

export function MarketDataBankSync() {
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<MarketSyncStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [skipOa, setSkipOa] = useState(false);
  const [forceOa, setForceOa] = useState(false);

  const refresh = useCallback(() => {
    fetch("/api/market-sync/weekly")
      .then((r) => r.json())
      .then((body: MarketSyncStatus) => {
        if (body.error && body.bank == null) {
          setError(body.error);
          return;
        }
        setStatus(body);
        setError(null);
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!status?.running) return;
    const id = setInterval(refresh, 3000);
    return () => clearInterval(id);
  }, [status?.running, refresh]);

  function start() {
    startTransition(async () => {
      setError(null);
      setMsg(null);
      try {
        const res = await fetch("/api/market-sync/weekly", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            background: true,
            skipOa,
            forceOa,
          }),
        });
        const body = (await res.json()) as {
          ok?: boolean;
          error?: string;
          message?: string;
          alreadyRunning?: boolean;
        };
        if (!res.ok && res.status !== 202) {
          setError(body.error ?? `HTTP ${res.status}`);
          refresh();
          return;
        }
        setMsg(body.message ?? "Weekly sync started.");
        refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    });
  }

  const meta = status?.lastRun?.meta ?? {};
  const phase = typeof meta.phase === "string" ? meta.phase : null;

  return (
    <section className="panel xl:col-span-3">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-desk-muted">Market data bank — weekly sync</h2>
        <span className="text-[11px] text-desk-muted">SQLite local-first · OA solds + street asks</span>
      </div>

      <p className="mb-3 text-sm text-desk-muted">
        One job refreshes Outdoor Analytics solds, then pulls street asks from GunsAlabama, ALGunForum,
        and curated sites (GunsInternational, AGT, WikiArms, etc.) into local SQLite. Batch and Evaluate
        read this bank — not live sites per lot. Run weekly or before an auction.
      </p>

      {error && <p className="mb-2 text-sm text-desk-nogo">{error}</p>}
      {msg && <p className="mb-2 text-sm text-desk-go">{msg}</p>}

      <div className="mb-3 grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="rounded border border-desk-border px-3 py-2">
          <div className="text-[10px] uppercase text-desk-muted">Ask observations</div>
          <div className="num text-lg font-bold">{status?.bank.askObservations ?? "—"}</div>
        </div>
        <div className="rounded border border-desk-border px-3 py-2">
          <div className="text-[10px] uppercase text-desk-muted">Last run</div>
          <div className="text-sm font-semibold">
            {status?.lastRun?.status ?? "—"}
            {status?.running ? " · running" : ""}
          </div>
          <div className="text-[10px] text-desk-muted">{fmtWhen(status?.lastRun?.finishedAt ?? status?.lastRun?.startedAt)}</div>
        </div>
        <div className="rounded border border-desk-border px-3 py-2 md:col-span-2">
          <div className="text-[10px] uppercase text-desk-muted">By source</div>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] num">
            {status && Object.keys(status.bank.bySource).length > 0 ? (
              Object.entries(status.bank.bySource)
                .sort((a, b) => b[1] - a[1])
                .map(([src, n]) => (
                  <span key={src}>
                    {src}: <strong>{n}</strong>
                  </span>
                ))
            ) : (
              <span className="text-desk-muted">No ask rows yet — run sync</span>
            )}
          </div>
        </div>
      </div>

      {phase && status?.running && (
        <p className="mb-2 text-xs text-desk-text">Phase: {phase}</p>
      )}
      {status?.lastRun?.error && (
        <p className="mb-2 text-xs text-desk-nogo">{status.lastRun.error}</p>
      )}

      <div className="mb-3 flex flex-wrap items-center gap-4 text-xs">
        <label className="flex items-center gap-1.5">
          <input
            type="checkbox"
            className="h-3.5 w-3.5 accent-desk-accent"
            checked={skipOa}
            onChange={(e) => setSkipOa(e.target.checked)}
          />
          Skip OA (asks only)
        </label>
        <label className="flex items-center gap-1.5">
          <input
            type="checkbox"
            className="h-3.5 w-3.5 accent-desk-accent"
            checked={forceOa}
            onChange={(e) => setForceOa(e.target.checked)}
            disabled={skipOa}
          />
          Force OA comps refresh
        </label>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={start}
          disabled={pending || status?.running}
          className="rounded-md bg-desk-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {status?.running ? "Sync running…" : "Run weekly sync now"}
        </button>
        <button
          type="button"
          onClick={refresh}
          className="rounded-md border border-desk-border px-3 py-2 text-sm text-desk-muted"
        >
          Refresh status
        </button>
      </div>
    </section>
  );
}
