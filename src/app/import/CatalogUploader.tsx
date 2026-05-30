"use client";

import { useRef, useState } from "react";

interface ImportResult {
  vendorName: string;
  parsed: number;
  upserted: number;
  skipped: number;
}

export function CatalogUploader({ vendors }: { vendors: { value: string; label: string }[] }) {
  const [vendor, setVendor] = useState(vendors[0]?.value ?? "lipseys");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setError("Choose a CSV file first.");
      return;
    }
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const fd = new FormData();
      fd.set("file", file);
      fd.set("vendor", vendor);
      const res = await fetch("/api/catalogs/import", { method: "POST", body: fd });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? `HTTP ${res.status}`);
      setResult(payload as ImportResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="field-label">Distributor</label>
          <select className="field-input" value={vendor} onChange={(e) => setVendor(e.target.value)}>
            {vendors.length === 0 && <option value="">Seed presets first</option>}
            {vendors.map((v) => (
              <option key={v.value} value={v.value}>
                {v.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="field-label">CSV file</label>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="field-input file:mr-3 file:rounded file:border-0 file:bg-desk-border file:px-2 file:py-1 file:text-desk-text"
          />
        </div>
      </div>
      <button
        type="submit"
        disabled={busy || vendors.length === 0}
        className="rounded-md bg-desk-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
      >
        {busy ? "Streaming & upserting..." : "Import catalog"}
      </button>

      {error && <p className="text-sm text-desk-nogo">{error}</p>}
      {result && (
        <div className="rounded-md border border-desk-go/40 bg-desk-go/10 p-3 text-sm">
          <span className="font-semibold capitalize text-desk-go">{result.vendorName}</span>:{" "}
          <span className="num">{result.upserted}</span> upserted,{" "}
          <span className="num">{result.parsed}</span> parsed,{" "}
          <span className="num">{result.skipped}</span> skipped.
        </div>
      )}
      <p className="text-[11px] text-desk-muted">
        Files stream in and write in 500-row batches (UPSERT on vendor + UPC/SKU), so large multi-MB
        exports stay within Lightsail memory. Re-importing is safe.
      </p>
    </form>
  );
}
