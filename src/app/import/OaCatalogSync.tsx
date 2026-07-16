"use client";

import { useCallback, useEffect, useState, useTransition } from "react";

import type { OaCatalogStatus, OaCatalogSyncReport } from "@/lib/oa/sync-catalog";

function fmtWhen(d: string | Date | null | undefined): string {
  if (!d) return "—";
  const dt = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(dt.getTime())) return "—";
  return dt.toLocaleString();
}

export function OaCatalogSync() {
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<OaCatalogStatus | null>(null);
  const [report, setReport] = useState<OaCatalogSyncReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [force, setForce] = useState(false);

  const refresh = useCallback(() => {
    fetch("/api/oa/sync-status")
      .then((r) => r.json())
      .then((body: OaCatalogStatus & { error?: string }) => {
        if (body.error && !body.coverage) {
          setError(body.error);
          return;
        }
        setStatus(body);
        setReport(body.lastRun?.report ?? null);
        setError(null);
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Poll while sync running
  useEffect(() => {
    if (!status?.syncRunning) return;
    const id = setInterval(refresh, 2500);
    return () => clearInterval(id);
  }, [status?.syncRunning, refresh]);

  function start(mode: "full" | "catalog" | "comps") {
    startTransition(async () => {
      setError(null);
      setMsg(null);
      try {
        const res = await fetch("/api/oa/sync-catalog", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode,
            force: mode !== "catalog" ? force : false,
            background: mode !== "catalog",
          }),
        });
        const body = (await res.json()) as {
          ok?: boolean;
          error?: string;
          message?: string;
          report?: OaCatalogSyncReport;
          alreadyRunning?: boolean;
        };
        if (!res.ok && res.status !== 202) {
          setError(body.error ?? `HTTP ${res.status}`);
          refresh();
          return;
        }
        if (body.report) setReport(body.report);
        setMsg(body.message ?? (mode === "catalog" ? "Catalog synced." : "Sync started."));
        refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    });
  }

  const coverage = report?.coverage ?? status?.coverage;
  const diff = report?.diff ?? status?.lastRun?.report?.diff;
  const progress = status?.lastCompsProgress;
  const comps = status?.comps;
  const pct =
    progress && progress.total > 0
      ? Math.round((progress.processed / progress.total) * 100)
      : comps?.coveragePct ?? 0;

  return (
    <section className="panel xl:col-span-3">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-desk-muted">
          Outdoor Analytics — full market sync (catalog + sold comps)
        </h2>
        <span className="text-[11px] text-desk-muted">Token in Session Vault · weekly or on demand</span>
      </div>

      <p className="mb-3 text-sm text-desk-muted">
        <strong className="font-medium text-desk-text">Sync everything</strong> pulls OA’s full brand/model/caliber
        tree, then sold + asking comps for <em>every</em> leaf into <code>oa_market_stats</code> and{" "}
        <code>oa_sold_comps</code>. Paste the Bearer token under Session Vault (
        <code>outdoor_analytics</code> / <code>market_api</code>). A full run can take a long time — leave this
        page open or check back; progress updates below.
      </p>

      {status && !status.ok && (
        <ul className="mb-3 list-inside list-disc text-sm text-desk-nogo">
          {status.issues.map((issue) => (
            <li key={issue}>{issue}</li>
          ))}
        </ul>
      )}

      {status?.ok && (
        <p className="mb-3 text-sm text-desk-go">
          Vault token ready.{" "}
          {status.syncRunning ? "Sync in progress…" : "Ready."}
        </p>
      )}

      <label className="mb-3 flex items-center gap-2 text-sm text-desk-muted">
        <input
          type="checkbox"
          checked={force}
          onChange={(e) => setForce(e.target.checked)}
          className="rounded border-desk-border"
        />
        Force re-pull comps even if synced in the last ~6 days
      </label>

      <div className="mb-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => start("full")}
          disabled={pending || !status?.hasToken || status?.syncRunning}
          className="rounded-md border border-desk-accent bg-desk-panel2 px-4 py-2 text-sm font-medium hover:border-desk-accent disabled:opacity-50"
        >
          {pending || status?.syncRunning ? "Syncing…" : "Sync everything (catalog + sold comps)"}
        </button>
        <button
          type="button"
          onClick={() => start("comps")}
          disabled={pending || !status?.hasToken || status?.syncRunning}
          className="rounded-md border border-desk-border px-3 py-2 text-sm hover:border-desk-accent disabled:opacity-50"
        >
          Resume / refresh comps only
        </button>
        <button
          type="button"
          onClick={() => start("catalog")}
          disabled={pending || !status?.hasToken || status?.syncRunning}
          className="rounded-md border border-desk-border px-3 py-2 text-sm text-desk-muted hover:border-desk-accent disabled:opacity-50"
        >
          Catalog tree only
        </button>
        <button
          type="button"
          onClick={refresh}
          disabled={pending}
          className="rounded-md border border-desk-border px-3 py-2 text-sm text-desk-muted hover:border-desk-accent disabled:opacity-50"
        >
          Refresh status
        </button>
      </div>

      {msg && <p className="mb-2 text-sm text-desk-go">{msg}</p>}
      {error && <p className="mb-3 text-sm text-desk-nogo">{error}</p>}

      {(progress || status?.syncRunning) && (
        <div className="mb-4 rounded-md border border-desk-border bg-desk-panel2 px-3 py-3">
          <div className="mb-1 flex justify-between text-xs text-desk-muted">
            <span>Comps progress</span>
            <span>
              {progress ? `${progress.processed} / ${progress.total}` : "…"} ({pct}%)
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-desk-bg">
            <div className="h-2 bg-desk-accent/80 transition-all" style={{ width: `${Math.min(100, pct)}%` }} />
          </div>
          {progress && (
            <p className="mt-2 text-xs text-desk-muted">
              with sold {progress.withSold} · zero sold {progress.zeroSold} · with asking {progress.withAsking} ·
              errors {progress.errors} · skipped fresh {progress.skippedFresh}
              {progress.current ? (
                <>
                  <br />
                  Current: {progress.current}
                </>
              ) : null}
            </p>
          )}
        </div>
      )}

      {coverage && (
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
          {[
            ["Brands unique", coverage.manufacturersUnique],
            ["Models unique", coverage.modelsUnique],
            ["Catalog rows", coverage.rows],
            ["Comps leaves", comps?.statsRows ?? 0],
            ["With sold", comps?.withSold ?? 0],
            ["With asking", comps?.withAsking ?? 0],
            ["Sold rows stored", comps?.soldCompRows ?? 0],
            ["Comps coverage", `${comps?.coveragePct ?? 0}%`],
          ].map(([label, value]) => (
            <div key={String(label)} className="rounded-md border border-desk-border bg-desk-panel2 px-3 py-2">
              <div className="text-[10px] uppercase tracking-wide text-desk-muted">{label}</div>
              <div className="num text-lg font-semibold">{value}</div>
            </div>
          ))}
        </div>
      )}

      {status?.lastRun && (
        <p className="mb-3 text-xs text-desk-muted">
          Last run: <span className="text-desk-text">{status.lastRun.status}</span>
          {" · "}
          {fmtWhen(status.lastRun.finishedAt ?? status.lastRun.startedAt)}
          {status.lastRun.rowCount != null ? ` · ${status.lastRun.rowCount} processed` : ""}
          {status.lastRun.error ? ` · ${status.lastRun.error}` : ""}
        </p>
      )}

      {diff && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <DiffBlock
            title={`Brands added (${diff.brandsAddedTotal})`}
            empty="No new brands vs previous catalog sync"
            items={diff.brandsAdded}
            truncated={diff.truncated && diff.brandsAddedTotal > diff.brandsAdded.length}
          />
          <DiffBlock
            title={`Brands removed (${diff.brandsRemovedTotal})`}
            empty="No brands removed"
            items={diff.brandsRemoved}
            truncated={diff.truncated && diff.brandsRemovedTotal > diff.brandsRemoved.length}
          />
          <DiffBlock
            title={`Models added (${diff.modelsAddedTotal})`}
            empty="No new models vs previous catalog sync"
            items={diff.modelsAdded.map((m) => `${m.manufacturer} — ${m.model} (${m.condition})`)}
            truncated={diff.truncated && diff.modelsAddedTotal > diff.modelsAdded.length}
          />
          <DiffBlock
            title={`Models removed (${diff.modelsRemovedTotal})`}
            empty="No models removed"
            items={diff.modelsRemoved.map((m) => `${m.manufacturer} — ${m.model} (${m.condition})`)}
            truncated={diff.truncated && diff.modelsRemovedTotal > diff.modelsRemoved.length}
          />
        </div>
      )}

      <div className="mt-4 rounded-md border border-desk-border/80 bg-desk-bg/40 px-3 py-2 text-xs text-desk-muted">
        <p className="font-medium text-desk-text">Completeness</p>
        <p className="mt-1">{status?.completeness.explanation}</p>
        <p className="mt-1">
          CLI: <code>npm run oa:sync</code> (full) or <code>npm run oa:sync-catalog</code> (tree only).
        </p>
      </div>
    </section>
  );
}

function DiffBlock({
  title,
  empty,
  items,
  truncated,
}: {
  title: string;
  empty: string;
  items: string[];
  truncated?: boolean;
}) {
  return (
    <div className="rounded-md border border-desk-border bg-desk-panel2 px-3 py-2">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-desk-muted">{title}</h3>
      {items.length === 0 ? (
        <p className="text-sm text-desk-muted">{empty}</p>
      ) : (
        <ul className="max-h-48 space-y-0.5 overflow-y-auto text-sm">
          {items.map((item) => (
            <li key={item} className="truncate">
              {item}
            </li>
          ))}
        </ul>
      )}
      {truncated && <p className="mt-1 text-[11px] text-desk-muted">List truncated — totals above are complete.</p>}
    </div>
  );
}
