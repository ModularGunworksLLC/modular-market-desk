"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type Item = {
  id: string;
  status: string;
  manufacturer: string;
  model: string;
  serialNumber: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  estimateP25: number | null;
  estimateLabel: string | null;
  notes: string | null;
  photoCount?: number;
  createdAt: string | Date;
  notifySent: boolean;
  notifyError: string | null;
};

type Photo = {
  id: string;
  originalName: string;
  thumbName: string | null;
};

export default function TradeInInboxPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [selected, setSelected] = useState<Item | null>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/trade-in/requests");
      const data = (await res.json()) as { ok?: boolean; items?: Item[]; error?: string };
      if (!res.ok) {
        setError(data.error || "Failed to load");
        return;
      }
      setItems(data.items || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const id = new URLSearchParams(window.location.search).get("id");
    if (id) void openDetail(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load]);

  async function openDetail(id: string) {
    setError(null);
    try {
      const res = await fetch(`/api/trade-in/requests/${id}`);
      const data = (await res.json()) as {
        ok?: boolean;
        item?: Item;
        photos?: Photo[];
        error?: string;
      };
      if (!res.ok || !data.item) {
        setError(data.error || "Not found");
        return;
      }
      setSelected(data.item);
      setPhotos(data.photos || []);
      const url = new URL(window.location.href);
      url.searchParams.set("id", id);
      window.history.replaceState({}, "", url.toString());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to open");
    }
  }

  async function markHandled() {
    if (!selected) return;
    const res = await fetch(`/api/trade-in/requests/${selected.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "handled" }),
    });
    if (res.ok) {
      setSelected({ ...selected, status: "handled" });
      void load();
    }
  }

  return (
    <main className="mx-auto max-w-[1200px] px-4 py-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-desk-text">Trade-in inbox</h1>
          <p className="text-sm text-desk-muted">Customer sell requests — soft estimates only.</p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded border border-desk-border px-3 py-1.5 text-xs text-desk-text"
        >
          Refresh
        </button>
      </div>

      {error ? <p className="mt-3 text-sm text-desk-nogo">{error}</p> : null}
      {loading ? <p className="mt-4 text-sm text-desk-muted">Loading…</p> : null}

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="overflow-hidden rounded border border-desk-border">
          <table className="w-full text-left text-xs">
            <thead className="bg-desk-panel2 text-desk-muted">
              <tr>
                <th className="px-2 py-2 font-medium">When</th>
                <th className="px-2 py-2 font-medium">Firearm</th>
                <th className="px-2 py-2 font-medium">Est.</th>
                <th className="px-2 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr
                  key={it.id}
                  className={`cursor-pointer border-t border-desk-border hover:bg-desk-panel2 ${
                    selected?.id === it.id ? "bg-desk-accent/10" : ""
                  }`}
                  onClick={() => void openDetail(it.id)}
                >
                  <td className="px-2 py-2 font-mono text-desk-muted">
                    {new Date(it.createdAt).toLocaleString()}
                  </td>
                  <td className="px-2 py-2 text-desk-text">
                    {it.manufacturer} {it.model}
                    <div className="text-desk-muted">{it.customerName}</div>
                  </td>
                  <td className="px-2 py-2 font-mono text-desk-text">
                    {it.estimateP25 != null ? `$${it.estimateP25.toFixed(0)}` : "—"}
                  </td>
                  <td className="px-2 py-2 text-desk-muted">{it.status}</td>
                </tr>
              ))}
              {!loading && items.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-2 py-6 text-center text-desk-muted">
                    No requests yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="rounded border border-desk-border bg-desk-panel p-4">
          {!selected ? (
            <p className="text-sm text-desk-muted">Select a request.</p>
          ) : (
            <div className="space-y-3 text-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h2 className="text-base font-semibold text-desk-text">
                    {selected.manufacturer} {selected.model}
                  </h2>
                  <p className="font-mono text-xs text-desk-muted">SN {selected.serialNumber}</p>
                </div>
                {selected.status !== "handled" ? (
                  <button
                    type="button"
                    onClick={() => void markHandled()}
                    className="rounded bg-desk-accent px-3 py-1.5 text-xs font-medium text-white"
                  >
                    Mark handled
                  </button>
                ) : (
                  <span className="text-xs text-desk-go">Handled</span>
                )}
              </div>
              <p className="font-mono text-desk-go">
                {selected.estimateLabel ||
                  (selected.estimateP25 != null
                    ? `Estimated trade interest ~$${selected.estimateP25.toFixed(2)}`
                    : "No estimate")}
              </p>
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
                <dt className="text-desk-muted">Customer</dt>
                <dd className="text-desk-text">{selected.customerName}</dd>
                <dt className="text-desk-muted">Email</dt>
                <dd className="text-desk-text">
                  <a className="underline" href={`mailto:${selected.customerEmail}`}>
                    {selected.customerEmail}
                  </a>
                </dd>
                <dt className="text-desk-muted">Phone</dt>
                <dd className="text-desk-text">
                  <a className="underline" href={`tel:${selected.customerPhone}`}>
                    {selected.customerPhone}
                  </a>
                </dd>
                {selected.notes ? (
                  <>
                    <dt className="text-desk-muted">Notes</dt>
                    <dd className="text-desk-text">{selected.notes}</dd>
                  </>
                ) : null}
                <dt className="text-desk-muted">Notify</dt>
                <dd className="text-desk-muted">
                  {selected.notifySent ? "Email sent" : selected.notifyError || "Not sent"}
                </dd>
              </dl>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {photos.map((p) => (
                  <a
                    key={p.id}
                    href={`/api/trade-in/requests/${selected.id}/photos/${p.id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="block overflow-hidden rounded border border-desk-border"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`/api/trade-in/requests/${selected.id}/photos/${p.id}?thumb=1`}
                      alt={p.originalName}
                      className="h-28 w-full object-cover"
                    />
                  </a>
                ))}
              </div>
              <Link href="/trade-in" className="inline-block text-xs text-desk-muted underline">
                Open public form
              </Link>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
