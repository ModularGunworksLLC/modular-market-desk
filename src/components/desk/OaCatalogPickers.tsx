"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { CatalogCombobox } from "@/components/desk/CatalogCombobox";

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
  const lastPickKey = useRef("");
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;

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
    lastPickKey.current = "";
  }, [cond]);

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

  useEffect(() => {
    if (typeof mfrId !== "number" || typeof modelId !== "number" || typeof caliberId !== "number") return;
    const mfr = manufacturers.find((m) => m.id === mfrId);
    const mod = models.find((m) => m.id === modelId);
    const cal = calibers.find((c) => c.id === caliberId);
    if (!mfr || !mod || !cal) return;
    const key = `${cond}:${mfr.id}:${mod.id}:${cal.id}`;
    if (key === lastPickKey.current) return;
    lastPickKey.current = key;
    onPickRef.current({
      manufacturerId: mfr.id,
      manufacturer: mfr.name,
      modelId: mod.id,
      model: mod.name,
      caliberId: cal.id,
      caliber: cal.name,
      condition: cond,
    });
  }, [mfrId, modelId, caliberId, manufacturers, models, calibers, cond]);

  const selectedCaliber = useMemo(
    () => calibers.find((c) => c.id === caliberId) ?? null,
    [calibers, caliberId],
  );

  const makeItems = useMemo(() => {
    const common = manufacturers.filter((m) => m.isCommon);
    const rest = manufacturers.filter((m) => !m.isCommon);
    const ordered = common.length ? [...common, ...rest] : manufacturers;
    return ordered.map((m) => ({
      id: m.id,
      name: m.name,
      hint: m.modelCount != null ? `${m.modelCount} models` : undefined,
    }));
  }, [manufacturers]);

  const modelItems = useMemo(
    () =>
      models.map((m) => ({
        id: m.id,
        name: m.name,
        hint: m.caliberCount != null ? `${m.caliberCount} cal` : undefined,
      })),
    [models],
  );

  return (
    <div className="col-span-2 space-y-2 rounded-md border border-desk-border bg-desk-panel2/60 p-3">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-desk-muted">
          OA catalog (Make → Model → Caliber)
        </h3>
        <span className="text-[10px] text-desk-muted">{cond} comps</span>
      </div>
      <p className="text-[11px] text-desk-muted">Type to search Make or Model, then pick Caliber.</p>

      {loading && <p className="text-xs text-desk-muted">Loading manufacturers…</p>}
      {error && <p className="text-xs text-desk-nogo">{error}</p>}

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <CatalogCombobox
          label="Make"
          items={makeItems}
          value={mfrId}
          onChange={setMfrId}
          placeholder="Search make…"
          disabled={!manufacturers.length}
        />
        <CatalogCombobox
          label="Model"
          items={modelItems}
          value={modelId}
          onChange={setModelId}
          placeholder={mfrId ? "Search model…" : "Pick make first"}
          disabled={!models.length}
        />
        <div>
          <label className="field-label">Caliber</label>
          <select
            className="field-input"
            value={caliberId === "" ? "" : String(caliberId)}
            onChange={(e) => setCaliberId(e.target.value ? Number(e.target.value) : "")}
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
