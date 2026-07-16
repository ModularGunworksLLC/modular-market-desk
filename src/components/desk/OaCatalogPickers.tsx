"use client";

import { useEffect, useMemo, useState } from "react";

type CatalogItem = {
  id: number;
  name: string;
  isCommon?: boolean;
  modelCount?: number;
  caliberCount?: number;
  soldCount?: number;
  soldP25?: number | null;
  soldMedian?: number | null;
};

export type OaPickSelection = {
  manufacturerId: number;
  manufacturer: string;
  modelId: number;
  model: string;
  caliberId: number;
  caliber: string;
  condition: "NEW" | "USED";
};

type Props = {
  /** Desk condition: used | new | any → maps to USED/NEW browse bucket */
  condition: string;
  manufacturer: string;
  model: string;
  caliber: string;
  onPick: (sel: OaPickSelection) => void;
};

function bucket(condition: string): "NEW" | "USED" {
  return condition === "new" ? "NEW" : "USED";
}

export function OaCatalogPickers({ condition, manufacturer, model, caliber, onPick }: Props) {
  const cond = bucket(condition);
  const [manufacturers, setManufacturers] = useState<CatalogItem[]>([]);
  const [models, setModels] = useState<CatalogItem[]>([]);
  const [calibers, setCalibers] = useState<CatalogItem[]>([]);
  const [mfrId, setMfrId] = useState<number | "">("");
  const [modelId, setModelId] = useState<number | "">("");
  const [caliberId, setCaliberId] = useState<number | "">("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/oa/catalog?level=manufacturers&condition=${cond}`)
      .then(async (r) => {
        const j = (await r.json()) as { ok?: boolean; items?: CatalogItem[]; error?: string };
        if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
        setManufacturers(j.items ?? []);
        if (!(j.items?.length)) {
          setError("No OA catalog in local DB yet — run Sync everything on Import.");
        }
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
    setMfrId("");
    setModelId("");
    setCaliberId("");
    setModels([]);
    setCalibers([]);
  }, [cond]);

  // Prefill make from free-text brand when possible
  useEffect(() => {
    if (!manufacturers.length || !manufacturer.trim()) return;
    const q = manufacturer.trim().toLowerCase();
    const hit =
      manufacturers.find((m) => m.name.toLowerCase() === q) ||
      manufacturers.find((m) => m.name.toLowerCase().includes(q) || q.includes(m.name.toLowerCase()));
    if (hit && hit.id !== mfrId) setMfrId(hit.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manufacturers, manufacturer]);

  useEffect(() => {
    if (!mfrId) {
      setModels([]);
      setModelId("");
      setCalibers([]);
      setCaliberId("");
      return;
    }
    fetch(`/api/oa/catalog?level=models&condition=${cond}&manufacturerId=${mfrId}`)
      .then(async (r) => {
        const j = (await r.json()) as { items?: CatalogItem[] };
        setModels(j.items ?? []);
      })
      .catch(() => setModels([]));
    setModelId("");
    setCalibers([]);
    setCaliberId("");
  }, [cond, mfrId]);

  useEffect(() => {
    if (!modelId) {
      setCalibers([]);
      setCaliberId("");
      return;
    }
    fetch(`/api/oa/catalog?level=calibers&condition=${cond}&modelId=${modelId}`)
      .then(async (r) => {
        const j = (await r.json()) as { items?: CatalogItem[] };
        setCalibers(j.items ?? []);
      })
      .catch(() => setCalibers([]));
    setCaliberId("");
  }, [cond, modelId]);

  // Prefill model / caliber from free text once lists load
  useEffect(() => {
    if (!models.length || !model.trim()) return;
    const q = model.trim().toLowerCase();
    const hit =
      models.find((m) => m.name.toLowerCase() === q) ||
      models.find((m) => m.name.toLowerCase().includes(q) || q.includes(m.name.toLowerCase()));
    if (hit) setModelId(hit.id);
  }, [models, model]);

  useEffect(() => {
    if (!calibers.length || !caliber.trim()) return;
    const q = caliber.trim().toLowerCase().replace(/\s+/g, "");
    const hit =
      calibers.find((c) => c.name.toLowerCase().replace(/\s+/g, "") === q) ||
      calibers.find((c) => c.name.toLowerCase().includes(caliber.trim().toLowerCase()));
    if (hit) setCaliberId(hit.id);
  }, [calibers, caliber]);

  const selectedCaliber = useMemo(
    () => calibers.find((c) => c.id === caliberId) ?? null,
    [calibers, caliberId],
  );

  function applyCaliber(id: number) {
    setCaliberId(id);
    const mfr = manufacturers.find((m) => m.id === mfrId);
    const mod = models.find((m) => m.id === modelId);
    const cal = calibers.find((c) => c.id === id);
    if (!mfr || !mod || !cal) return;
    onPick({
      manufacturerId: mfr.id,
      manufacturer: mfr.name,
      modelId: mod.id,
      model: mod.name,
      caliberId: cal.id,
      caliber: cal.name,
      condition: cond,
    });
  }

  const commonFirst = useMemo(() => {
    const common = manufacturers.filter((m) => m.isCommon);
    const rest = manufacturers.filter((m) => !m.isCommon);
    return { common, rest };
  }, [manufacturers]);

  return (
    <div className="col-span-2 space-y-2 rounded-md border border-desk-border bg-desk-panel2/60 p-3">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-desk-muted">
          OA catalog pick (Make → Model → Caliber)
        </h3>
        <span className="text-[10px] text-desk-muted">{cond} comps</span>
      </div>
      <p className="text-[11px] text-desk-muted">
        Pick from the synced Outdoor Analytics catalog so Evaluate pulls exact local comps — same flow as OA’s
        dropdowns.
      </p>

      {loading && <p className="text-xs text-desk-muted">Loading manufacturers…</p>}
      {error && <p className="text-xs text-desk-nogo">{error}</p>}

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <div>
          <label className="field-label">Make</label>
          <select
            className="field-input"
            value={mfrId === "" ? "" : String(mfrId)}
            onChange={(e) => setMfrId(e.target.value ? Number(e.target.value) : "")}
            disabled={!manufacturers.length}
          >
            <option value="">Select make…</option>
            {commonFirst.common.length > 0 && (
              <optgroup label="Common">
                {commonFirst.common.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </optgroup>
            )}
            <optgroup label="All">
              {(commonFirst.common.length ? commonFirst.rest : manufacturers).map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </optgroup>
          </select>
        </div>
        <div>
          <label className="field-label">Model</label>
          <select
            className="field-input"
            value={modelId === "" ? "" : String(modelId)}
            onChange={(e) => setModelId(e.target.value ? Number(e.target.value) : "")}
            disabled={!models.length}
          >
            <option value="">{mfrId ? "Select model…" : "Pick make first"}</option>
            {models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="field-label">Caliber</label>
          <select
            className="field-input"
            value={caliberId === "" ? "" : String(caliberId)}
            onChange={(e) => {
              const id = e.target.value ? Number(e.target.value) : NaN;
              if (Number.isFinite(id)) applyCaliber(id);
              else setCaliberId("");
            }}
            disabled={!calibers.length}
          >
            <option value="">{modelId ? "Select caliber…" : "Pick model first"}</option>
            {calibers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.soldCount != null && c.soldCount > 0
                  ? ` · ${c.soldCount} sold${c.soldMedian != null ? ` · med $${Math.round(c.soldMedian)}` : ""}`
                  : " · no solds yet"}
              </option>
            ))}
          </select>
        </div>
      </div>

      {selectedCaliber && (
        <p className="text-[11px] text-desk-go">
          Ready — Evaluate will use local comps
          {selectedCaliber.soldCount
            ? ` (${selectedCaliber.soldCount} sold${
                selectedCaliber.soldP25 != null ? `, P25 $${Math.round(selectedCaliber.soldP25)}` : ""
              })`
            : ""}
          .
        </p>
      )}
    </div>
  );
}
