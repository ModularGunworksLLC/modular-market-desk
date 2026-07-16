import { z } from "zod";

import { IdentifyError } from "@/lib/identify/errors";
import type { FirearmIdentity, IdentifyResult } from "@/lib/identify/types";

export const identitySchema = z.object({
  manufacturer: z.string().default(""),
  model: z.string().default(""),
  variant: z.string().default(""),
  caliber: z.string().default(""),
  category: z.enum(["handgun", "rifle", "shotgun", "other"]).default("other"),
  condition: z.enum(["new", "used", "any"]).default("used"),
  conditionNotes: z.string().default(""),
  serial: z.string().default(""),
  accessories: z.array(z.string()).default([]),
  confidence: z.number().min(0).max(100).default(0),
  warnings: z.array(z.string()).default([]),
  candidates: z
    .array(
      z.object({
        manufacturer: z.string(),
        model: z.string(),
        variant: z.string().default(""),
        caliber: z.string().default(""),
        reason: z.string().default(""),
      }),
    )
    .default([]),
});

export function stripDataUrl(b64: string): string {
  const m = b64.match(/^data:[^;]+;base64,(.+)$/i);
  const payload = m?.[1] ?? b64;
  return payload.replace(/\s+/g, "");
}

export function normalizeIdentity(raw: z.infer<typeof identitySchema>): FirearmIdentity {
  const serial = raw.serial.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  return {
    manufacturer: raw.manufacturer.trim(),
    model: raw.model.trim(),
    variant: raw.variant.trim(),
    caliber: raw.caliber.trim(),
    category: raw.category,
    condition: raw.condition,
    conditionNotes: raw.conditionNotes.trim(),
    serial,
    accessories: raw.accessories.map((a) => a.trim()).filter(Boolean),
    confidence: Math.round(raw.confidence),
    warnings: raw.warnings.map((w) => w.trim()).filter(Boolean),
    candidates: raw.candidates.map((c) => ({
      manufacturer: c.manufacturer.trim(),
      model: c.model.trim(),
      variant: c.variant.trim(),
      caliber: c.caliber.trim(),
      reason: c.reason.trim(),
    })),
  };
}

export function extractJsonObject(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1));
    }
    throw new IdentifyError("Model returned non-JSON identity payload.", 502);
  }
}

export function toIdentifyResult(identity: FirearmIdentity, modelUsed: string): IdentifyResult {
  if (!identity.manufacturer || !identity.model) {
    throw new IdentifyError(
      "Could not determine make/model — retake closer shots of rollmarks or enter Brand/Model manually.",
      422,
    );
  }
  return {
    identity,
    modelUsed,
    evaluateDefaults: {
      manufacturer: identity.manufacturer,
      model: identity.variant ? `${identity.model} ${identity.variant}`.trim() : identity.model,
      caliber: identity.caliber,
      category: identity.category === "other" ? "handgun" : identity.category,
      condition: identity.condition,
    },
  };
}
