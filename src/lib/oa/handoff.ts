/**
 * Popup handoff rules. Saving is a separate step: accepting a postMessage
 * only queues a preview. The Desk page POSTs on an explicit Save click.
 */

import { jwtShapeOk, decodeJwtExp } from "@/lib/oa/jwt";
import { expIsFarFuture, formatChicago, formatHoursUntil } from "@/lib/oa/status";

export type ConnectPhase = "waiting" | "confirm" | "saving" | "done";

export function canSave(phase: ConnectPhase): boolean {
  return phase === "confirm";
}

export function acceptHandoffMessage(input: {
  origin: string;
  source: unknown;
  opener: unknown;
  allowedOrigins: readonly string[];
  data: unknown;
}): string | null {
  if (input.opener == null) return null;
  if (input.source !== input.opener) return null;
  if (!input.allowedOrigins.includes(input.origin)) return null;
  if (!input.data || typeof input.data !== "object") return null;
  const data = input.data as { type?: unknown; token?: unknown };
  if (data.type !== "desk-oa-token" || typeof data.token !== "string") return null;
  if (!jwtShapeOk(data.token)) return null;
  return data.token;
}

export interface HandoffPreview {
  malformed: boolean;
  expiresAt: string | null;
  expiresAtChicago: string | null;
  hoursLabel: string | null;
  suspicious: boolean;
  /** Display only. Not checked against a trusted issuer. */
  iss: string | null;
  aud: string | null;
}

export function previewOaToken(token: string, now = new Date()): HandoffPreview {
  const exp = decodeJwtExp(token);
  const claims = readDisplayClaims(token);
  if (!exp) {
    return {
      malformed: true,
      expiresAt: null,
      expiresAtChicago: null,
      hoursLabel: null,
      suspicious: false,
      iss: claims.iss,
      aud: claims.aud,
    };
  }
  return {
    malformed: false,
    expiresAt: exp.toISOString(),
    expiresAtChicago: formatChicago(exp),
    hoursLabel: formatHoursUntil(exp, now),
    suspicious: expIsFarFuture(exp, now),
    iss: claims.iss,
    aud: claims.aud,
  };
}

function readDisplayClaims(token: string): { iss: string | null; aud: string | null } {
  try {
    const seg = token.split(".")[1];
    if (!seg) return { iss: null, aud: null };
    const pad = seg.length % 4 === 0 ? "" : "=".repeat(4 - (seg.length % 4));
    const b64 = seg.replace(/-/g, "+").replace(/_/g, "/") + pad;
    const binary = atob(b64);
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    const json = new TextDecoder().decode(bytes);
    const payload = JSON.parse(json) as { iss?: unknown; aud?: unknown };
    return { iss: claimText(payload.iss), aud: claimText(payload.aud) };
  } catch {
    return { iss: null, aud: null };
  }
}

function claimText(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim().slice(0, 80);
  if (Array.isArray(value)) {
    const parts = value.filter((v) => typeof v === "string").map((v) => v.trim()).filter(Boolean);
    if (parts.length === 0) return null;
    return parts.join(", ").slice(0, 80);
  }
  return null;
}
