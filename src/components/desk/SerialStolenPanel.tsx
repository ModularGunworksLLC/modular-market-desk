"use client";

import { useState } from "react";

import type { StolenCheckResult } from "@/lib/stolen/hotgunz";

interface Props {
  serial: string;
  onSerialChange: (v: string) => void;
  stolen: StolenCheckResult | null;
  onStolen: (r: StolenCheckResult | null) => void;
}

export function SerialStolenPanel({ serial, onSerialChange, stolen, onStolen }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runCheck() {
    const s = serial.trim();
    if (!s) {
      setError("Enter a serial number first.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/stolen-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serial: s }),
      });
      const json = (await res.json()) as StolenCheckResult;
      onStolen(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Check failed");
      onStolen(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel space-y-3">
      <div>
        <h2 className="text-sm font-semibold text-desk-text">Serial / stolen gate</h2>
        <p className="mt-0.5 text-[11px] text-desk-muted">
          S/N alone cannot ID make/model. Use it for HotGunz (crowdsourced — not NCIC) and records.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <input
          className="field-input min-w-[12rem] flex-1 font-mono uppercase"
          value={serial}
          onChange={(e) => {
            onSerialChange(e.target.value.toUpperCase());
            onStolen(null);
          }}
          placeholder="Enter serial number"
          autoComplete="off"
        />
        <button
          type="button"
          disabled={busy || !serial.trim()}
          onClick={() => void runCheck()}
          className="rounded-md bg-desk-accent px-3 py-2 text-sm font-semibold text-white disabled:opacity-40"
        >
          {busy ? "Checking…" : "HotGunz check"}
        </button>
      </div>
      {error && <p className="text-sm text-desk-nogo">{error}</p>}
      {stolen && (
        <p
          className={
            stolen.status === "hit"
              ? "rounded-md border border-desk-nogo/50 bg-desk-nogo/10 px-3 py-2 text-sm font-semibold text-desk-nogo"
              : "text-[11px] text-desk-muted"
          }
        >
          HotGunz: <span className="uppercase">{stolen.status}</span> — {stolen.detail}
          {stolen.status === "hit" ? " · Do not buy until cleared." : ""}
        </p>
      )}
    </section>
  );
}
