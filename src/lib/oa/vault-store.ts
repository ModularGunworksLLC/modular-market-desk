/**
 * Outdoor Analytics row in the Session Vault.
 * Ciphertext format is unchanged (AES-256-GCM). This module adds expiry, probe
 * status, and an audit log that never stores the token.
 */

import { and, desc, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { auditLog, connections, type AuditAction } from "@/lib/db/schema";
import { decodeJwtExp, jwtShapeOk } from "@/lib/oa/jwt";
import {
  ENV_TOKEN_OVERRIDE_NOTE,
  FAR_EXPIRY_NOTE,
  expIsFarFuture,
  formatChicago,
  formatHoursUntil,
  liveTokenBlocked,
  oaStatusMessage,
  resolveOaState,
  type OaConnectionState,
} from "@/lib/oa/status";
import { oaExpiryWarnMs } from "@/lib/oa/config";
import { OaTokenBlockedError } from "@/lib/oa/live-label";
import { decryptSecret, encryptSecret, normalizeVaultSecret, redactLiteral, redactSecrets } from "@/lib/vault";

export const OA_VENDOR = "outdoor_analytics";
export const OA_KIND = "market_api" as const;

export interface OaVaultSnapshot {
  connected: boolean;
  status: string | null;
  expiresAt: Date | null;
  lastUsedAt: Date | null;
  updatedAt: Date | null;
  lastSetAt: string | null;
  lastProbeAt: string | null;
  lastProbeOk: boolean | null;
  /** Present only when a live call is allowed. Never send this to the client. */
  usableToken: string | null;
  decryptFailed: boolean;
}

export interface PublicOaStatus {
  ok: boolean;
  state: OaConnectionState;
  expiresAt: string | null;
  expiresAtChicago: string | null;
  hoursRemaining: number | null;
  lastSetAt: string | null;
  lastUsedAt: string | null;
  lastProbeAt: string | null;
  lastProbeOk: boolean | null;
  warnWithinHours: number;
  message: string;
  connectHref: string;
  /** exp is more than 30 days out. Display warning only; not an auth decision. */
  expSuspicious: boolean;
  /** GBA_BEARER_TOKEN is set. Sync ignores a cleared vault token. */
  envTokenOverride: boolean;
}

let tablesReady: Promise<void> | null = null;

export function ensureOaVaultTables(): Promise<void> {
  if (!tablesReady) {
    tablesReady = db.$client
      .executeMultiple(
        `
        CREATE TABLE IF NOT EXISTS connections (
          id text PRIMARY KEY NOT NULL,
          kind text NOT NULL,
          vendor text NOT NULL,
          label text NOT NULL,
          secret text NOT NULL,
          meta text DEFAULT '{}' NOT NULL,
          status text DEFAULT 'active' NOT NULL,
          last_used_at integer,
          expires_at integer,
          created_at integer DEFAULT (unixepoch()) NOT NULL,
          updated_at integer DEFAULT (unixepoch()) NOT NULL
        );
        CREATE UNIQUE INDEX IF NOT EXISTS connections_vendor_kind_ux ON connections (vendor, kind);
        CREATE TABLE IF NOT EXISTS audit_log (
          id text PRIMARY KEY NOT NULL,
          actor text NOT NULL,
          action text NOT NULL,
          target text NOT NULL DEFAULT 'outdoor_analytics',
          detail text NOT NULL DEFAULT '{}',
          created_at integer DEFAULT (unixepoch()) NOT NULL
        );
        CREATE INDEX IF NOT EXISTS audit_log_created_idx ON audit_log (created_at);
        `,
      )
      .then(() => undefined)
      .catch((err) => {
        tablesReady = null;
        throw err;
      });
  }
  return tablesReady;
}

export async function writeOaAudit(
  action: AuditAction,
  actor: string,
  detail: Record<string, unknown>,
): Promise<void> {
  await ensureOaVaultTables();
  const scrubbed = scrubAuditDetail(detail);
  await db.insert(auditLog).values({
    actor: actor.slice(0, 80),
    action,
    target: OA_VENDOR,
    detail: scrubbed,
  });
  await pruneOaAudit();
}

/** Keep the newest rows so a noisy client cannot grow this table without bound. */
export async function pruneOaAudit(keep = 500): Promise<void> {
  await ensureOaVaultTables();
  const n = Math.max(1, Math.floor(keep));
  await db.$client.execute({
    sql: `DELETE FROM audit_log WHERE id NOT IN (
      SELECT id FROM audit_log ORDER BY created_at DESC, id DESC LIMIT ?
    )`,
    args: [n],
  });
}

export function scrubAuditDetail(detail: Record<string, unknown>): Record<string, unknown> {
  const json = redactSecrets(JSON.stringify(detail));
  try {
    const parsed = JSON.parse(json) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    /* fall through */
  }
  return { note: "audit detail redacted" };
}

export async function loadOaVault(): Promise<OaVaultSnapshot> {
  await ensureOaVaultTables();
  const rows = await db
    .select()
    .from(connections)
    .where(and(eq(connections.vendor, OA_VENDOR), eq(connections.kind, OA_KIND)))
    .limit(1);
  const row = rows[0];
  if (!row || row.status === "revoked") {
    return emptySnapshot();
  }
  const meta = readMeta(row.meta);
  const expiresAt = row.expiresAt ?? null;
  const expired = expiresAt != null && expiresAt.getTime() <= Date.now();
  let usableToken: string | null = null;
  let decryptFailed = false;
  if (row.status === "active" && !expired) {
    try {
      const token = normalizeVaultSecret(decryptSecret(row.secret));
      usableToken = token && token !== "cleared" ? token : null;
    } catch {
      decryptFailed = true;
      usableToken = null;
    }
  }
  const connected = !decryptFailed && row.secret.trim().length > 0 && row.status !== "revoked";
  return {
    connected: decryptFailed ? false : connected,
    status: row.status,
    expiresAt,
    lastUsedAt: row.lastUsedAt ?? null,
    updatedAt: row.updatedAt ?? null,
    lastSetAt: meta.lastSetAt,
    lastProbeAt: meta.lastProbeAt,
    lastProbeOk: meta.lastProbeOk,
    usableToken: decryptFailed ? null : usableToken,
    decryptFailed,
  };
}

export function toPublicOaStatus(snap: OaVaultSnapshot, now = new Date()): PublicOaStatus {
  const warnWithinMs = oaExpiryWarnMs();
  const state = snap.decryptFailed
    ? "not_connected"
    : resolveOaState({
        connected: snap.connected,
        status: snap.status,
        expiresAt: snap.expiresAt,
        lastProbeOk: snap.lastProbeOk,
        now,
        warnWithinMs,
      });
  const hoursRemaining =
    snap.expiresAt != null ? (snap.expiresAt.getTime() - now.getTime()) / 3_600_000 : null;
  const expSuspicious = expIsFarFuture(snap.expiresAt, now);
  const envTokenOverride = Boolean(process.env.GBA_BEARER_TOKEN?.trim());
  let message = snap.decryptFailed
    ? "Saved OA token could not be decrypted with this server's vault key. Connect OA again."
    : oaStatusMessage(state, snap.expiresAt, now);
  if (expSuspicious) message += FAR_EXPIRY_NOTE;
  if (envTokenOverride) message += ENV_TOKEN_OVERRIDE_NOTE;
  return {
    ok: state === "connected" || state === "expiring_soon",
    state,
    expiresAt: snap.expiresAt ? snap.expiresAt.toISOString() : null,
    expiresAtChicago: snap.expiresAt ? formatChicagoSafe(snap.expiresAt) : null,
    hoursRemaining,
    lastSetAt: snap.lastSetAt,
    lastUsedAt: snap.lastUsedAt ? snap.lastUsedAt.toISOString() : null,
    lastProbeAt: snap.lastProbeAt,
    lastProbeOk: snap.lastProbeOk,
    warnWithinHours: warnWithinMs / 3_600_000,
    message,
    connectHref: "/import#connect-oa",
    expSuspicious,
    envTokenOverride,
  };
}

export async function saveOaToken(
  token: string,
  actor: string,
  auditExtra?: Record<string, unknown>,
): Promise<{ expiresAt: Date; message: string }> {
  const normalized = normalizeVaultSecret(token);
  if (!normalized) {
    throw new OaSaveError("empty_token", "No OA token was provided.");
  }
  if (!jwtShapeOk(normalized)) {
    throw new OaSaveError(
      "malformed_jwt",
      "The OA token is not a JWT with an exp claim. Sign in to Outdoor Analytics and try Connect OA again.",
    );
  }
  const expiresAt = decodeJwtExp(normalized);
  if (!expiresAt) {
    throw new OaSaveError(
      "malformed_jwt",
      "The OA token is not a JWT with an exp claim. Sign in to Outdoor Analytics and try Connect OA again.",
    );
  }

  let encrypted: string;
  try {
    encrypted = encryptSecret(normalized);
  } catch (err) {
    throw new OaSaveError("vault_key", safeError(err, normalized));
  }

  await ensureOaVaultTables();
  const existing = await db
    .select({ meta: connections.meta })
    .from(connections)
    .where(and(eq(connections.vendor, OA_VENDOR), eq(connections.kind, OA_KIND)))
    .limit(1);
  const prev = (existing[0]?.meta as Record<string, unknown> | undefined) ?? {};
  const nowIso = new Date().toISOString();
  const merged: Record<string, unknown> = {
    ...prev,
    lastSetAt: nowIso,
    lastProbeAt: null,
    lastProbeOk: null,
    lastProbeHttp: null,
  };

  try {
    await db
      .insert(connections)
      .values({
        vendor: OA_VENDOR,
        kind: OA_KIND,
        label: "Outdoor Analytics",
        secret: encrypted,
        meta: merged,
        status: "active",
        expiresAt,
      })
      .onConflictDoUpdate({
        target: [connections.vendor, connections.kind],
        set: {
          label: "Outdoor Analytics",
          secret: encrypted,
          meta: merged,
          status: "active",
          expiresAt,
          updatedAt: new Date(),
        },
      });
  } catch (err) {
    throw new OaSaveError("save_failed", safeError(err, normalized));
  }

  await writeOaAudit("oa_token_set", actor, {
    expiresAt: expiresAt.toISOString(),
    source: "oa_connect",
    expSuspicious: expIsFarFuture(expiresAt, new Date()),
    ...auditExtra,
  });

  const suspicious = expIsFarFuture(expiresAt, new Date());
  return {
    expiresAt,
    message:
      `OA connected to Desk. Expires at ${formatChicago(expiresAt)} (${formatHoursUntil(expiresAt, new Date())}).` +
      (suspicious ? FAR_EXPIRY_NOTE : ""),
  };
}

export async function clearOaToken(actor: string, auditExtra?: Record<string, unknown>): Promise<void> {
  await ensureOaVaultTables();
  const rows = await db
    .select({ id: connections.id, meta: connections.meta })
    .from(connections)
    .where(and(eq(connections.vendor, OA_VENDOR), eq(connections.kind, OA_KIND)))
    .limit(1);
  const row = rows[0];
  if (!row) {
    await writeOaAudit("oa_token_clear", actor, { note: "no row", ...auditExtra });
    return;
  }
  const prev = (row.meta as Record<string, unknown> | undefined) ?? {};
  const cleared = encryptSecret("cleared");
  await db
    .update(connections)
    .set({
      secret: cleared,
      status: "revoked",
      expiresAt: null,
      meta: { ...prev, clearedAt: new Date().toISOString(), lastProbeOk: null, lastProbeAt: null },
      updatedAt: new Date(),
    })
    .where(eq(connections.id, row.id));
  await writeOaAudit("oa_token_clear", actor, { note: "ciphertext replaced", ...auditExtra });
}

export async function markOaProbeOk(): Promise<void> {
  await patchOaProbe({ ok: true, http: 200, status: "active" });
}

export async function markOaUnauthorized(): Promise<void> {
  await patchOaProbe({ ok: false, http: 401, status: "error" });
}

async function patchOaProbe(patch: { ok: boolean; http: number; status: "active" | "error" }): Promise<void> {
  await ensureOaVaultTables();
  const rows = await db
    .select({ id: connections.id, meta: connections.meta, status: connections.status })
    .from(connections)
    .where(and(eq(connections.vendor, OA_VENDOR), eq(connections.kind, OA_KIND)))
    .limit(1);
  const row = rows[0];
  if (!row || row.status === "revoked") return;
  const prev = (row.meta as Record<string, unknown> | undefined) ?? {};
  await db
    .update(connections)
    .set({
      status: patch.status,
      lastUsedAt: new Date(),
      meta: {
        ...prev,
        lastProbeAt: new Date().toISOString(),
        lastProbeOk: patch.ok,
        lastProbeHttp: patch.http,
      },
      updatedAt: new Date(),
    })
    .where(eq(connections.id, row.id));
}

/** Token for a live OA call, or a typed error that sync jobs must surface. */
export async function requireUsableOaToken(): Promise<string> {
  const env = process.env.GBA_BEARER_TOKEN?.trim();
  if (env) {
    const token = normalizeVaultSecret(env);
    if (!token) throw new OaTokenBlockedError("missing");
    const exp = decodeJwtExp(token);
    if (exp && exp.getTime() <= Date.now()) throw new OaTokenBlockedError("expired");
    return token;
  }
  const snap = await loadOaVault();
  const state = resolveOaState({
    connected: snap.connected,
    status: snap.status,
    expiresAt: snap.expiresAt,
    lastProbeOk: snap.lastProbeOk,
    now: new Date(),
    warnWithinMs: oaExpiryWarnMs(),
  });
  const block = liveTokenBlocked(state);
  if (block || !snap.usableToken) {
    throw new OaTokenBlockedError(block ?? "missing");
  }
  return snap.usableToken;
}

export async function latestOaAudit(): Promise<Array<{ action: string; actor: string; detail: string }>> {
  await ensureOaVaultTables();
  const rows = await db.select().from(auditLog).orderBy(desc(auditLog.createdAt)).limit(20);
  return rows.map((r) => ({
    action: r.action,
    actor: r.actor,
    detail: JSON.stringify(r.detail ?? {}),
  }));
}

export class OaSaveError extends Error {
  readonly reason: string;

  constructor(reason: string, message: string) {
    super(message);
    this.name = "OaSaveError";
    this.reason = reason;
  }
}

function emptySnapshot(): OaVaultSnapshot {
  return {
    connected: false,
    status: null,
    expiresAt: null,
    lastUsedAt: null,
    updatedAt: null,
    lastSetAt: null,
    lastProbeAt: null,
    lastProbeOk: null,
    usableToken: null,
    decryptFailed: false,
  };
}

function readMeta(meta: unknown): { lastSetAt: string | null; lastProbeAt: string | null; lastProbeOk: boolean | null } {
  const m = meta && typeof meta === "object" ? (meta as Record<string, unknown>) : {};
  return {
    lastSetAt: typeof m.lastSetAt === "string" ? m.lastSetAt : null,
    lastProbeAt: typeof m.lastProbeAt === "string" ? m.lastProbeAt : null,
    lastProbeOk: typeof m.lastProbeOk === "boolean" ? m.lastProbeOk : null,
  };
}

function safeError(err: unknown, secret: string): string {
  const raw = err instanceof Error ? err.message : "Save failed.";
  return redactLiteral(raw, secret);
}

function formatChicagoSafe(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(date);
}
