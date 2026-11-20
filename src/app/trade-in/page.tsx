"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

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

const MIN_PHOTOS = 2;
const MAX_PHOTOS = 6;

const SLOT_LABELS = [
  "Photo 1 — left / overall *",
  "Photo 2 — right / serial *",
  "Photo 3 — optional",
  "Photo 4 — optional",
  "Photo 5 — optional",
  "Photo 6 — optional",
];

declare global {
  interface Window {
    turnstile?: {
      render: (
        el: HTMLElement,
        opts: { sitekey: string; callback: (token: string) => void; "expired-callback"?: () => void },
      ) => string;
      reset: (id?: string) => void;
    };
    heic2any?: (opts: {
      blob: Blob;
      toType?: string;
      quality?: number;
    }) => Promise<Blob | Blob[]>;
  }
}

function isHeicLike(file: File): boolean {
  const type = (file.type || "").toLowerCase();
  const name = file.name || "";
  return (
    type.includes("heic") ||
    type.includes("heif") ||
    /\.heic$/i.test(name) ||
    /\.heif$/i.test(name)
  );
}

let heic2anyLoader: Promise<NonNullable<Window["heic2any"]>> | null = null;

function loadHeic2Any(): Promise<NonNullable<Window["heic2any"]>> {
  if (typeof window !== "undefined" && window.heic2any) {
    return Promise.resolve(window.heic2any);
  }
  if (!heic2anyLoader) {
    heic2anyLoader = new Promise((resolve, reject) => {
      const existing = document.querySelector<HTMLScriptElement>('script[data-heic2any="1"]');
      if (existing && window.heic2any) {
        resolve(window.heic2any);
        return;
      }
      const s = document.createElement("script");
      s.src = "/vendor/heic2any.min.js";
      s.async = true;
      s.dataset.heic2any = "1";
      s.onload = () => {
        if (window.heic2any) resolve(window.heic2any);
        else reject(new Error("HEIC converter loaded but unavailable"));
      };
      s.onerror = () => reject(new Error("Could not load HEIC converter"));
      document.head.appendChild(s);
    });
  }
  return heic2anyLoader;
}

async function bitmapToJpegFile(file: File, bitmap: ImageBitmap): Promise<File> {
  const maxEdge = 2400;
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    throw new Error("Could not prepare photo canvas");
  }
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob((b) => resolve(b), "image/jpeg", 0.88),
  );
  if (!blob) throw new Error("Could not encode JPEG");
  const base = file.name.replace(/\.[^.]+$/i, "") || "photo";
  return new File([blob], `${base}.jpg`, { type: "image/jpeg", lastModified: Date.now() });
}

/** Always upload JPEG — convert HEIC/HEIF (and other formats) in-browser before submit. */
async function fileToUploadJpeg(file: File): Promise<File> {
  const type = (file.type || "").toLowerCase();
  if (type === "image/jpeg" || type === "image/jpg") return file;

  // 1) Native decode (Safari often can draw HEIC; Chrome usually cannot)
  try {
    const bitmap = await createImageBitmap(file);
    return await bitmapToJpegFile(file, bitmap);
  } catch {
    // fall through
  }

  // 2) Dedicated HEIC decoder (works in Chrome / Android / many desktops)
  if (isHeicLike(file)) {
    try {
      const heic2any = await loadHeic2Any();
      const converted = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.88 });
      const blob = Array.isArray(converted) ? converted[0] : converted;
      if (!blob) throw new Error("empty conversion");
      const base = file.name.replace(/\.[^.]+$/i, "") || "photo";
      return new File([blob], `${base}.jpg`, { type: "image/jpeg", lastModified: Date.now() });
    } catch (err) {
      const detail = err instanceof Error ? err.message : "conversion failed";
      throw new Error(
        `Could not convert HEIC photo "${file.name}" (${detail}). Try a JPEG/PNG, or on iPhone use Camera → Formats → Most Compatible.`,
      );
    }
  }

  // 3) <img> + object URL fallback for other formats
  try {
    const url = URL.createObjectURL(file);
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("image load failed"));
      el.src = url;
    });
    URL.revokeObjectURL(url);
    const bitmap = await createImageBitmap(img);
    return await bitmapToJpegFile(file, bitmap);
  } catch {
    throw new Error(
      `Could not prepare photo "${file.name}". Please upload a JPEG or PNG instead.`,
    );
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
  const [photoSlots, setPhotoSlots] = useState<(File | null)[]>([null, null]);
  const [estimate, setEstimate] = useState<EstimateResponse | null>(null);
  const [estimating, setEstimating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [doneId, setDoneId] = useState<string | null>(null);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [convertingSlot, setConvertingSlot] = useState<number | null>(null);

  const selectedPhotos = useMemo(() => photoSlots.filter((f): f is File => f != null), [photoSlots]);
  const photoCount = selectedPhotos.length;
  const photosOk = photoCount >= MIN_PHOTOS;

  const setSlotFile = useCallback((index: number, file: File | null) => {
    setPhotoSlots((prev) => {
      const next = [...prev];
      next[index] = file;
      return next;
    });
  }, []);

  const onPickPhoto = useCallback(
    async (index: number, file: File | null) => {
      setError(null);
      if (!file) {
        setSlotFile(index, null);
        return;
      }
      setConvertingSlot(index);
      try {
        const jpeg = await fileToUploadJpeg(file);
        setSlotFile(index, jpeg);
      } catch (err) {
        setSlotFile(index, null);
        setError(err instanceof Error ? err.message : "Could not prepare that photo.");
      } finally {
        setConvertingSlot(null);
      }
    },
    [setSlotFile],
  );

  const addOptionalSlot = useCallback(() => {
    setPhotoSlots((prev) => (prev.length >= MAX_PHOTOS ? prev : [...prev, null]));
  }, []);

  const removeOptionalSlot = useCallback((index: number) => {
    setPhotoSlots((prev) => {
      if (index < MIN_PHOTOS) {
        const next = [...prev];
        next[index] = null;
        return next;
      }
      return prev.filter((_, i) => i !== index);
    });
  }, []);

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

  const runEstimate = useCallback(async (signal?: AbortSignal) => {
    const make = manufacturer.trim();
    const mdl = model.trim();
    if (make.length < 2 || mdl.length < 1) {
      setEstimate(null);
      return;
    }
    setEstimating(true);
    try {
      const res = await fetch("/api/trade-in/estimate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          manufacturer: make,
          model: mdl,
          caliber: caliber.trim() || undefined,
        }),
        signal,
      });
      if (signal?.aborted) return;
      const data = (await res.json()) as EstimateResponse;
      setEstimate(data);
    } catch (err) {
      if (signal?.aborted || (err instanceof DOMException && err.name === "AbortError")) return;
      setEstimate({
        ok: false,
        estimateP25: null,
        soldCount: 0,
        label: "",
        message: "Could not reach estimate — you can still submit.",
      });
    } finally {
      if (!signal?.aborted) setEstimating(false);
    }
  }, [manufacturer, model, caliber]);

  useEffect(() => {
    const ac = new AbortController();
    const t = window.setTimeout(() => {
      void runEstimate(ac.signal);
    }, 450);
    return () => {
      window.clearTimeout(t);
      ac.abort();
    };
  }, [runEstimate]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (selectedPhotos.length < MIN_PHOTOS) {
      setError(`Upload at least ${MIN_PHOTOS} photos of the firearm (one per box).`);
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
      for (const f of selectedPhotos.slice(0, MAX_PHOTOS)) {
        const jpeg = await fileToUploadJpeg(f);
        if (isHeicLike(jpeg)) {
          throw new Error(
            `Photo "${f.name}" is still HEIC after conversion. Please upload a JPEG/PNG or screenshot instead.`,
          );
        }
        fd.append("photos", jpeg);
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
          href="https://www.modulargunworks.com/"
          className="mt-8 inline-block rounded-md bg-desk-accent px-4 py-2 text-sm font-medium text-white"
        >
          Back to Modular Gunworks
        </a>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-lg px-4 py-8">
      <a
        href="https://www.modulargunworks.com/"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-desk-muted transition hover:text-desk-text"
      >
        <span aria-hidden="true">←</span>
        Back to Modular Gunworks
      </a>
      <p className="mt-4 text-xs font-medium uppercase tracking-wide text-desk-muted">
        <a href="https://www.modulargunworks.com/" className="hover:text-desk-text">
          Modular Gunworks
        </a>
      </p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight text-desk-text">Sell us your firearm</h1>
      <p className="mt-2 text-sm text-desk-muted">
        Get a soft estimate (after typical resale fees and our profit floor), upload at least two photos,
        and we will follow up. Final value is set after in-person inspection — not a cash offer from this
        form.
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
            <>
              <p className="font-mono text-base font-semibold text-desk-text">{estimate.label}</p>
              <p className="mt-1 text-xs text-desk-muted">{estimate.message}</p>
            </>
          ) : (
            <p className="text-sm text-desk-muted">
              {estimate?.message || "Enter make and model for a soft estimate."}
            </p>
          )}
        </div>

        <fieldset className="space-y-3">
          <legend className="text-xs font-medium uppercase tracking-wide text-desk-muted">
            Photos * (one file per box)
          </legend>
          <p className="text-xs text-desk-muted">
            Choose each photo separately — one file per box. HEIC photos are converted to JPEG
            automatically on this page before upload.
          </p>
          {photoSlots.map((file, index) => {
            const inputId = `trade-in-photo-${index}`;
            const busy = convertingSlot !== null;
            return (
              <div
                key={`slot-${index}`}
                className="rounded border border-desk-border bg-desk-panel px-3 py-3"
              >
                <p className="text-xs font-medium uppercase tracking-wide text-desk-muted">
                  {SLOT_LABELS[index] || `Photo ${index + 1}`}
                </p>
                {/* Hidden native input — browser "No file chosen" text confused people after HEIC→JPEG convert */}
                <input
                  id={inputId}
                  required={index < MIN_PHOTOS && !file}
                  type="file"
                  accept="image/*,.heic,.heif"
                  onChange={(e) => {
                    const picked = e.target.files?.[0] ?? null;
                    e.target.value = "";
                    void onPickPhoto(index, picked);
                  }}
                  disabled={busy}
                  className="sr-only"
                />
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <label
                    htmlFor={inputId}
                    className={`inline-flex cursor-pointer items-center rounded bg-desk-accent px-3 py-1.5 text-xs font-medium text-white ${
                      busy ? "pointer-events-none opacity-60" : ""
                    }`}
                  >
                    {file ? "Replace photo" : "Choose photo"}
                  </label>
                  {(index >= MIN_PHOTOS || file) && (
                    <button
                      type="button"
                      onClick={() => removeOptionalSlot(index)}
                      disabled={busy}
                      className="text-xs font-medium text-desk-muted underline hover:text-desk-text disabled:opacity-60"
                    >
                      {index >= MIN_PHOTOS && !file ? "Remove" : "Clear"}
                    </button>
                  )}
                </div>
                {convertingSlot === index ? (
                  <p className="mt-2 text-xs text-desk-muted">Converting photo to JPEG…</p>
                ) : file ? (
                  <p className="mt-2 truncate text-sm font-medium text-desk-text">
                    ✓ Ready: {file.name}
                  </p>
                ) : (
                  <p className="mt-2 text-xs text-desk-nogo">No photo chosen yet</p>
                )}
              </div>
            );
          })}
          {photoSlots.length < MAX_PHOTOS ? (
            <button
              type="button"
              onClick={addOptionalSlot}
              className="text-sm font-medium text-desk-accent underline"
            >
              + Add another photo
            </button>
          ) : null}
          <p
            className={`text-sm font-medium ${
              photosOk ? "text-desk-muted" : "text-desk-nogo"
            }`}
          >
            Photos ready: {photoCount} / {MIN_PHOTOS} minimum (max {MAX_PHOTOS})
            {!photosOk ? " — fill the required boxes to enable submit" : ""}
          </p>
        </fieldset>

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
          disabled={submitting || !photosOk || convertingSlot !== null}
          className="w-full rounded-md bg-desk-accent px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
        >
          {submitting
            ? "Submitting…"
            : !photosOk
              ? `Add ${MIN_PHOTOS - photoCount} more photo${MIN_PHOTOS - photoCount === 1 ? "" : "s"} to submit`
              : "Submit trade-in request"}
        </button>
        <p className="text-center text-[11px] text-desk-muted">
          By submitting you confirm the information is accurate. Estimate is informational only.
        </p>
        <p className="text-center text-sm">
          <a
            href="https://www.modulargunworks.com/"
            className="font-medium text-desk-muted underline hover:text-desk-text"
          >
            Cancel and return to the website
          </a>
        </p>
      </form>
    </main>
  );
}
