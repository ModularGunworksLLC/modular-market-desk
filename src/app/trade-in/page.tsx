"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

type EstimateResponse = {
  ok: boolean;
  estimateP25: number | null;
  soldCount: number;
  label: string;
  message: string;
  matchedManufacturer?: string | null;
  matchedModel?: string | null;
};

const SITE_KEY =
  typeof process !== "undefined"
    ? process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() || ""
    : "";

declare global {
  interface Window {
    turnstile?: {
      render: (
        el: HTMLElement,
        opts: { sitekey: string; callback: (token: string) => void; "expired-callback"?: () => void },
      ) => string;
      reset: (id?: string) => void;
    };
  }
}

export default function TradeInPage() {
  const [manufacturer, setManufacturer] = useState("");
  const [model, setModel] = useState("");
  const [caliber, setCaliber] = useState("");
  const [serialNumber, setSerialNumber] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [files, setFiles] = useState<FileList | null>(null);
  const [estimate, setEstimate] = useState<EstimateResponse | null>(null);
  const [estimating, setEstimating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [doneId, setDoneId] = useState<string | null>(null);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);

  useEffect(() => {
    if (!SITE_KEY) return;
    const existing = document.querySelector('script[src*="turnstile"]');
    if (existing) return;
    const s = document.createElement("script");
    s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    s.async = true;
    document.head.appendChild(s);
  }, []);

  useEffect(() => {
    if (!SITE_KEY) return;
    const el = document.getElementById("cf-turnstile");
    if (!el || !window.turnstile) {
      const t = window.setInterval(() => {
        if (window.turnstile && document.getElementById("cf-turnstile")) {
          window.clearInterval(t);
          window.turnstile.render(document.getElementById("cf-turnstile")!, {
            sitekey: SITE_KEY,
            callback: (token) => setTurnstileToken(token),
            "expired-callback": () => setTurnstileToken(null),
          });
        }
      }, 200);
      return () => window.clearInterval(t);
    }
    window.turnstile.render(el, {
      sitekey: SITE_KEY,
      callback: (token) => setTurnstileToken(token),
      "expired-callback": () => setTurnstileToken(null),
    });
    return undefined;
  }, []);

  const runEstimate = useCallback(async () => {
    if (!manufacturer.trim() || !model.trim()) {
      setEstimate(null);
      return;
    }
    setEstimating(true);
    try {
      const res = await fetch("/api/trade-in/estimate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          manufacturer: manufacturer.trim(),
          model: model.trim(),
          caliber: caliber.trim() || undefined,
        }),
      });
      const data = (await res.json()) as EstimateResponse;
      setEstimate(data);
    } catch {
      setEstimate({
        ok: false,
        estimateP25: null,
        soldCount: 0,
        label: "",
        message: "Could not reach estimate — you can still submit.",
      });
    } finally {
      setEstimating(false);
    }
  }, [manufacturer, model, caliber]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      void runEstimate();
    }, 450);
    return () => window.clearTimeout(t);
  }, [runEstimate]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!files || files.length < 2) {
      setError("Upload at least 2 photos of the firearm.");
      return;
    }
    if (SITE_KEY && !turnstileToken) {
      setError("Complete the bot check before submitting.");
      return;
    }
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.set("manufacturer", manufacturer.trim());
      fd.set("model", model.trim());
      fd.set("serialNumber", serialNumber.trim());
      if (caliber.trim()) fd.set("caliber", caliber.trim());
      fd.set("customerName", customerName.trim());
      fd.set("customerEmail", customerEmail.trim());
      fd.set("customerPhone", customerPhone.trim());
      if (notes.trim()) fd.set("notes", notes.trim());
      if (turnstileToken) fd.set("turnstileToken", turnstileToken);
      for (const f of Array.from(files).slice(0, 6)) {
        fd.append("photos", f);
      }
      const res = await fetch("/api/trade-in/submit", { method: "POST", body: fd });
      const data = (await res.json()) as { ok?: boolean; id?: string; error?: string; message?: string };
      if (!res.ok || !data.ok) {
        setError(data.error || "Submit failed");
        return;
      }
      setDoneId(data.id ?? "ok");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Submit failed");
    } finally {
      setSubmitting(false);
    }
  }

  if (doneId) {
    return (
      <main className="mx-auto max-w-lg px-4 py-12">
        <h1 className="text-2xl font-semibold tracking-tight text-desk-text">Request received</h1>
        <p className="mt-3 text-sm text-desk-muted">
          Thanks — Modular Gunworks received your trade-in request
          {doneId !== "ok" ? (
            <>
              {" "}
              (<span className="font-mono text-desk-text">{doneId.slice(0, 8)}</span>…)
            </>
          ) : null}
          . We will contact you after reviewing the photos. Any number shown was a soft estimate only,
          not a binding offer.
        </p>
        <a
          href="https://modulargunworks.com"
          className="mt-8 inline-block rounded-md bg-desk-accent px-4 py-2 text-sm font-medium text-white"
        >
          Back to Modular Gunworks
        </a>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-lg px-4 py-8">
      <p className="text-xs font-medium uppercase tracking-wide text-desk-muted">Modular Gunworks</p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight text-desk-text">Sell us your firearm</h1>
      <p className="mt-2 text-sm text-desk-muted">
        Get a soft market-based estimate, upload photos, and we will follow up. Final value is set after
        in-person inspection — not a cash offer from this form.
      </p>

      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block text-xs font-medium uppercase tracking-wide text-desk-muted">
            Make *
            <input
              required
              value={manufacturer}
              onChange={(e) => setManufacturer(e.target.value)}
              className="mt-1 w-full rounded border border-desk-border bg-desk-panel px-3 py-2 text-sm text-desk-text"
              placeholder="e.g. Glock"
            />
          </label>
          <label className="block text-xs font-medium uppercase tracking-wide text-desk-muted">
            Model *
            <input
              required
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="mt-1 w-full rounded border border-desk-border bg-desk-panel px-3 py-2 text-sm text-desk-text"
              placeholder="e.g. 19 Gen 5"
            />
          </label>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block text-xs font-medium uppercase tracking-wide text-desk-muted">
            Caliber
            <input
              value={caliber}
              onChange={(e) => setCaliber(e.target.value)}
              className="mt-1 w-full rounded border border-desk-border bg-desk-panel px-3 py-2 text-sm text-desk-text"
              placeholder="Optional"
            />
          </label>
          <label className="block text-xs font-medium uppercase tracking-wide text-desk-muted">
            Serial # *
            <input
              required
              value={serialNumber}
              onChange={(e) => setSerialNumber(e.target.value)}
              className="mt-1 w-full rounded border border-desk-border bg-desk-panel px-3 py-2 font-mono text-sm text-desk-text"
            />
          </label>
        </div>

        <div className="rounded border border-desk-border bg-desk-panel2 px-3 py-3">
          {estimating ? (
            <p className="text-sm text-desk-muted">Checking market…</p>
          ) : estimate?.ok && estimate.label ? (
            <p className="font-mono text-lg font-semibold text-desk-go">{estimate.label}</p>
          ) : (
            <p className="text-sm text-desk-muted">
              {estimate?.message || "Enter make and model for a soft estimate."}
            </p>
          )}
          {estimate?.message && estimate.ok ? (
            <p className="mt-1 text-xs text-desk-muted">{estimate.message}</p>
          ) : null}
        </div>

        <label className="block text-xs font-medium uppercase tracking-wide text-desk-muted">
          Photos * (2–6)
          <input
            required
            type="file"
            accept="image/*"
            multiple
            onChange={(e) => setFiles(e.target.files)}
            className="mt-1 block w-full text-sm text-desk-text file:mr-3 file:rounded file:border-0 file:bg-desk-accent file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-white"
          />
        </label>
        <p className="text-xs text-desk-muted">Clear photos of both sides and the serial if possible.</p>

        <div className="grid grid-cols-1 gap-3">
          <label className="block text-xs font-medium uppercase tracking-wide text-desk-muted">
            Your name *
            <input
              required
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              className="mt-1 w-full rounded border border-desk-border bg-desk-panel px-3 py-2 text-sm text-desk-text"
            />
          </label>
          <label className="block text-xs font-medium uppercase tracking-wide text-desk-muted">
            Email *
            <input
              required
              type="email"
              value={customerEmail}
              onChange={(e) => setCustomerEmail(e.target.value)}
              className="mt-1 w-full rounded border border-desk-border bg-desk-panel px-3 py-2 text-sm text-desk-text"
            />
          </label>
          <label className="block text-xs font-medium uppercase tracking-wide text-desk-muted">
            Phone *
            <input
              required
              type="tel"
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
              className="mt-1 w-full rounded border border-desk-border bg-desk-panel px-3 py-2 text-sm text-desk-text"
            />
          </label>
          <label className="block text-xs font-medium uppercase tracking-wide text-desk-muted">
            Notes
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="mt-1 w-full rounded border border-desk-border bg-desk-panel px-3 py-2 text-sm text-desk-text"
              placeholder="Condition, accessories, etc."
            />
          </label>
        </div>

        {SITE_KEY ? <div id="cf-turnstile" className="pt-1" /> : null}

        {error ? <p className="text-sm text-desk-nogo">{error}</p> : null}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-md bg-desk-accent px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
        >
          {submitting ? "Submitting…" : "Submit trade-in request"}
        </button>
        <p className="text-center text-[11px] text-desk-muted">
          By submitting you confirm the information is accurate. Estimate is informational only.
        </p>
      </form>
    </main>
  );
}
