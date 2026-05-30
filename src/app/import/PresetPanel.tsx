"use client";

import { useState, useTransition } from "react";

import { seedDefaultPresets } from "@/lib/actions/presets";

export function PresetPanel({ presets }: { presets: { vendorName: string; label: string }[] }) {
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [ok, setOk] = useState(true);

  function seed() {
    startTransition(async () => {
      const res = await seedDefaultPresets();
      setOk(res.ok);
      setMsg(res.message);
    });
  }

  return (
    <section className="panel">
      <h2 className="mb-3 text-sm font-semibold text-desk-muted">CSV header presets</h2>
      {presets.length === 0 ? (
        <p className="mb-3 text-sm text-desk-muted">No presets yet.</p>
      ) : (
        <ul className="mb-3 space-y-1 text-sm">
          {presets.map((p) => (
            <li key={p.vendorName} className="flex justify-between border-b border-desk-border pb-1">
              <span>{p.label}</span>
              <span className="font-mono text-xs text-desk-muted">{p.vendorName}</span>
            </li>
          ))}
        </ul>
      )}
      <button
        onClick={seed}
        disabled={pending}
        className="w-full rounded-md border border-desk-border bg-desk-panel2 px-3 py-2 text-sm font-medium hover:border-desk-accent disabled:opacity-50"
      >
        {pending ? "Seeding..." : "Seed / refresh default presets"}
      </button>
      {msg && <p className={`mt-2 text-sm ${ok ? "text-desk-go" : "text-desk-nogo"}`}>{msg}</p>}
      <p className="mt-2 text-[11px] text-desk-muted">
        Presets map each distributor&apos;s raw headers (Lipsey&apos;s, Zanders, Davidson&apos;s,
        Chattanooga) onto unified catalog columns.
      </p>
    </section>
  );
}
