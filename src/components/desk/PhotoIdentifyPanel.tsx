"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { FirearmIdentity } from "@/lib/identify/types";
import type { StolenCheckResult } from "@/lib/stolen/hotgunz";

import {
  CAPTURE_STEPS,
  GUN_TYPE_OPTIONS,
  GunSilhouette,
  type GunTypeOption,
  type GunVisualType,
} from "./gun-types";

type EvaluatePatch = {
  manufacturer: string;
  model: string;
  caliber: string;
  category: string;
  condition: string;
};

interface Props {
  gunTypeHint?: string;
  onApply: (patch: EvaluatePatch, identity: FirearmIdentity) => void;
}

type Phase = "idle" | "type" | "capture" | "done";

interface StepPhoto {
  stepId: string;
  file: File;
  preview: string;
}

async function fileToPayload(file: File): Promise<{ mimeType: string; dataBase64: string }> {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  return {
    mimeType: file.type || "image/jpeg",
    dataBase64: btoa(binary),
  };
}

export function PhotoIdentifyPanel({ onApply }: Props) {
  const galleryRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [phase, setPhase] = useState<Phase>("idle");
  const [picked, setPicked] = useState<GunTypeOption | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [photos, setPhotos] = useState<StepPhoto[]>([]);
  const [cameraOk, setCameraOk] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [identity, setIdentity] = useState<FirearmIdentity | null>(null);
  const [modelUsed, setModelUsed] = useState("");
  const [stolen, setStolen] = useState<StolenCheckResult | null>(null);
  const [stolenBusy, setStolenBusy] = useState(false);

  const step = CAPTURE_STEPS[stepIndex]!;
  const totalSteps = CAPTURE_STEPS.length;
  const photosForStep = photos.filter((p) => p.stepId === step.id);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const startCamera = useCallback(async () => {
    stopCamera();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => undefined);
      }
      setCameraOk(true);
    } catch {
      setCameraOk(false);
    }
  }, [stopCamera]);

  useEffect(() => {
    if (phase === "capture") void startCamera();
    else stopCamera();
    return () => stopCamera();
  }, [phase, startCamera, stopCamera]);

  useEffect(() => {
    return () => {
      for (const p of photos) URL.revokeObjectURL(p.preview);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- revoke on unmount only
  }, []);

  function resetAll() {
    stopCamera();
    for (const p of photos) URL.revokeObjectURL(p.preview);
    setPhase("idle");
    setPicked(null);
    setStepIndex(0);
    setPhotos([]);
    setCameraOk(null);
    setLoading(false);
    setError(null);
    setIdentity(null);
    setStolen(null);
    setModelUsed("");
  }

  function selectType(opt: GunTypeOption) {
    setPicked(opt);
    setStepIndex(0);
    setPhotos([]);
    setIdentity(null);
    setError(null);
    setPhase("capture");
  }

  function addFile(file: File) {
    if (!file.type.startsWith("image/")) {
      setError("Choose an image file.");
      return;
    }
    const preview = URL.createObjectURL(file);
    setPhotos((prev) => {
      const without = prev.filter((p) => p.stepId !== step.id);
      const doomed = prev.find((p) => p.stepId === step.id);
      if (doomed) URL.revokeObjectURL(doomed.preview);
      return [...without, { stepId: step.id, file, preview }];
    });
    setError(null);
  }

  function onGallery(list: FileList | null) {
    const f = list?.[0];
    if (f) addFile(f);
  }

  async function captureFromCamera() {
    const video = videoRef.current;
    if (!video || !cameraOk || video.videoWidth < 2) {
      galleryRef.current?.click();
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", 0.92));
    if (!blob) return;
    addFile(new File([blob], `${step.id}.jpg`, { type: "image/jpeg" }));
  }

  function goNext() {
    if (stepIndex < totalSteps - 1) {
      setStepIndex((i) => i + 1);
      return;
    }
    void runIdentify();
  }

  function skipStep() {
    goNext();
  }

  async function runIdentify() {
    if (photos.length === 0) {
      setError("Add at least one photo (or use gallery) before identifying.");
      return;
    }
    setLoading(true);
    setError(null);
    setIdentity(null);
    setStolen(null);
    stopCamera();
    try {
      const images = await Promise.all(photos.map((p) => fileToPayload(p.file)));
      const res = await fetch("/api/identify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          images,
          gunType: picked?.gunTypeHint || picked?.category,
          hintText: picked ? `Visual type selected: ${picked.label}` : undefined,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || `Identify failed (${res.status})`);
      const id = json.identity as FirearmIdentity;
      const defaults = json.evaluateDefaults as EvaluatePatch;
      if (picked && (!defaults.category || defaults.category === "other")) {
        defaults.category = picked.category;
      }
      setIdentity(id);
      setModelUsed(json.modelUsed || "");
      onApply(defaults, id);
      setPhase("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Identify failed");
      setPhase("capture");
      void startCamera();
    } finally {
      setLoading(false);
    }
  }

  async function runStolenCheck() {
    if (!identity?.serial) {
      setError("No serial from photos — retake the serial step with a clearer shot.");
      return;
    }
    setStolenBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/stolen-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serial: identity.serial }),
      });
      setStolen((await res.json()) as StolenCheckResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Stolen check failed");
    } finally {
      setStolenBusy(false);
    }
  }

  if (phase === "idle") {
    return (
      <section className="panel space-y-3 border-desk-accent/40">
        <div>
          <h2 className="text-sm font-semibold text-desk-text">Photo identify</h2>
          <p className="mt-0.5 text-[11px] text-desk-muted">
            Guided photos like a counter scan — then OA pricing on Evaluate
          </p>
        </div>
        <button
          type="button"
          onClick={() => setPhase("type")}
          className="flex min-h-[120px] w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-desk-accent/50 bg-desk-panel2 px-4 py-6 text-center transition hover:border-desk-accent hover:bg-desk-accent/10"
        >
          <span className="text-base font-semibold text-desk-text">Start firearm scan</span>
          <span className="text-[11px] text-desk-muted">Pick type → take guided photos → identify</span>
        </button>
      </section>
    );
  }

  if (phase === "type") {
    return (
      <section className="panel space-y-4 border-desk-accent/40">
        <div className="text-center">
          <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-desk-accent" />
          <h2 className="text-lg font-bold text-desk-text">What are we looking at?</h2>
          <p className="mt-1 text-xs text-desk-muted">
            Select the type that is closest visually — helps the photo steps and ID model.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {GUN_TYPE_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => selectType(opt)}
              className="flex flex-col overflow-hidden rounded-lg border border-desk-border bg-desk-panel2 text-left transition hover:border-desk-accent"
            >
              <div className="flex h-24 items-center justify-center bg-desk-bg px-3">
                <GunSilhouette type={opt.id as GunVisualType} className="h-14 w-full max-w-[140px]" />
              </div>
              <div className="border-t border-desk-border px-3 py-2 text-center text-xs font-semibold uppercase tracking-wide text-desk-muted">
                {opt.label}
              </div>
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setPhase("idle")}
          className="w-full rounded-md border border-desk-border py-2 text-sm text-desk-muted hover:text-desk-text"
        >
          Cancel
        </button>
      </section>
    );
  }

  if (phase === "done" && identity) {
    return (
      <section className="panel space-y-3 border-desk-go/40">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-desk-text">Identified</h2>
            <p className="text-[11px] text-desk-muted">{picked?.label}</p>
          </div>
          <button type="button" className="text-xs text-desk-accent hover:underline" onClick={resetAll}>
            Scan another
          </button>
        </div>
        <div className="space-y-2 rounded-md border border-desk-go/40 bg-desk-go/5 p-3 text-sm">
          <p className="font-medium text-desk-text">
            {identity.manufacturer} {identity.model}
            {identity.variant ? ` · ${identity.variant}` : ""}
            {identity.caliber ? ` · ${identity.caliber}` : ""}
          </p>
          <p className="text-[11px] text-desk-muted">
            Confidence {identity.confidence}% · {identity.category} · {identity.condition}
            {modelUsed ? ` · ${modelUsed}` : ""}
          </p>
          <p className="text-[11px] text-desk-go">Brand / model filled below — press Evaluate for max bid.</p>
          {identity.serial ? (
            <p className="font-mono text-xs">Serial: {identity.serial}</p>
          ) : (
            <p className="text-[11px] text-desk-muted">No serial read — consider redoing serial photo</p>
          )}
          {identity.warnings.length > 0 && (
            <ul className="list-disc pl-4 text-[11px] text-desk-warn">
              {identity.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          )}
          <button
            type="button"
            className="rounded-md border border-desk-border px-2 py-1 text-xs disabled:opacity-40"
            disabled={stolenBusy || !identity.serial}
            onClick={() => void runStolenCheck()}
          >
            {stolenBusy ? "Checking HotGunz…" : "HotGunz serial check"}
          </button>
          {stolen && (
            <p className={stolen.status === "hit" ? "text-sm font-semibold text-desk-nogo" : "text-[11px] text-desk-muted"}>
              HotGunz: {stolen.status} — {stolen.detail}
            </p>
          )}
        </div>
        {error && <p className="text-sm text-desk-nogo">{error}</p>}
        <ul className="flex flex-wrap gap-2">
          {photos.map((p) => (
            <li key={p.stepId} className="h-16 w-16 overflow-hidden rounded border border-desk-border">
              <img src={p.preview} alt={p.stepId} className="h-full w-full object-cover" />
            </li>
          ))}
        </ul>
      </section>
    );
  }

  // capture phase
  return (
    <section className="overflow-hidden rounded-lg border border-desk-border bg-desk-panel">
      <div className="flex items-center justify-between gap-2 bg-desk-accent px-3 py-2 text-white">
        <button type="button" className="text-sm opacity-90 hover:opacity-100" onClick={() => setPhase("type")}>
          ← Type
        </button>
        <button
          type="button"
          className="rounded-full bg-white/15 px-3 py-1 text-xs font-semibold"
          onClick={() => setPhase("type")}
        >
          {picked?.label ?? "Gun"} ▿
        </button>
        <button type="button" className="text-sm opacity-90 hover:opacity-100" onClick={resetAll}>
          ✕
        </button>
      </div>

      <div className="relative bg-black">
        <div className="absolute left-0 right-0 top-0 z-10 bg-gradient-to-b from-black/70 to-transparent px-4 py-3 text-center">
          <p className="text-[10px] font-medium uppercase tracking-widest text-white/70">
            Step {stepIndex + 1} of {totalSteps}
          </p>
          <p className="text-lg font-bold text-white">{step.title}</p>
          <p className="text-xs text-white/80">{step.hint}</p>
        </div>

        <div className="relative flex min-h-[280px] items-center justify-center">
          {cameraOk ? (
            <video ref={videoRef} playsInline muted className="max-h-[360px] w-full object-cover" />
          ) : (
            <div className="px-6 py-20 text-center">
              <p className="text-sm text-white/80">
                {cameraOk === null ? "Starting camera…" : "No camera found on this device"}
              </p>
              <p className="mt-2 text-xs text-white/50">Use the gallery button to upload a photo for this step</p>
            </div>
          )}
          {photosForStep[0] && (
            <div className="absolute bottom-3 right-3 h-20 w-20 overflow-hidden rounded-md border-2 border-desk-accent shadow-lg">
              <img src={photosForStep[0].preview} alt="This step" className="h-full w-full object-cover" />
            </div>
          )}
        </div>
      </div>

      <div className="space-y-3 bg-desk-panel2 p-4">
        <div className="h-1.5 overflow-hidden rounded-full bg-desk-border">
          <div
            className="h-full rounded-full bg-desk-accent transition-all"
            style={{ width: `${((stepIndex + (photosForStep.length ? 1 : 0)) / totalSteps) * 100}%` }}
          />
        </div>
        <div className="flex justify-between gap-1">
          {CAPTURE_STEPS.map((s, i) => {
            const has = photos.some((p) => p.stepId === s.id);
            const active = i === stepIndex;
            return (
              <button
                key={s.id}
                type="button"
                title={s.title}
                onClick={() => setStepIndex(i)}
                className={`flex h-8 w-8 items-center justify-center rounded-full text-[10px] font-bold ${
                  active
                    ? "border-2 border-desk-accent text-desk-accent"
                    : has
                      ? "bg-desk-accent/30 text-desk-text"
                      : "bg-desk-border text-desk-muted"
                }`}
              >
                {has ? "✓" : i + 1}
              </button>
            );
          })}
        </div>

        <input
          ref={galleryRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="sr-only"
          onChange={(e) => {
            onGallery(e.target.files);
            e.target.value = "";
          }}
        />

        <div className="flex items-center justify-center gap-6 py-2">
          <button
            type="button"
            title="Upload from gallery"
            onClick={() => galleryRef.current?.click()}
            className="flex h-12 w-12 items-center justify-center rounded-lg border border-desk-border text-desk-text hover:border-desk-accent"
          >
            <svg viewBox="0 0 24 24" className="h-6 w-6 fill-none stroke-current" strokeWidth="1.8" aria-hidden>
              <rect x="3" y="5" width="18" height="14" rx="2" />
              <circle cx="9" cy="11" r="2" />
              <path d="M3 16l5-4 4 3 3-2 6 5" />
            </svg>
          </button>
          <button
            type="button"
            title="Capture"
            onClick={() => void captureFromCamera()}
            className="flex h-16 w-16 items-center justify-center rounded-full border-4 border-desk-accent bg-white shadow-lg"
          >
            <span className="h-12 w-12 rounded-full bg-desk-accent/20" />
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={() => (photosForStep.length || photos.length ? goNext() : skipStep())}
            className="flex h-12 min-w-[4.5rem] items-center justify-center rounded-lg border border-desk-border px-2 text-xs font-semibold text-desk-text hover:border-desk-accent disabled:opacity-40"
          >
            {stepIndex >= totalSteps - 1 ? (loading ? "…" : "ID") : "Next"}
          </button>
        </div>

        <button
          type="button"
          disabled={loading}
          onClick={() => skipStep()}
          className="w-full rounded-md bg-desk-accent/20 py-2.5 text-sm font-medium text-desk-accent hover:bg-desk-accent/30 disabled:opacity-40"
        >
          {loading
            ? "Identifying…"
            : stepIndex >= totalSteps - 1
              ? photos.length
                ? "Identify with photos so far"
                : `Skip ${step.title}`
              : `Skip ${step.title}`}
        </button>

        {photos.length > 0 && stepIndex < totalSteps - 1 && (
          <button
            type="button"
            disabled={loading}
            onClick={() => void runIdentify()}
            className="w-full text-xs text-desk-muted underline hover:text-desk-text"
          >
            Identify now ({photos.length} photo{photos.length === 1 ? "" : "s"})
          </button>
        )}

        {error && <p className="text-center text-sm text-desk-nogo">{error}</p>}
      </div>
    </section>
  );
}
