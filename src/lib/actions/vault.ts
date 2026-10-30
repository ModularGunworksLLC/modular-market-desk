"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/lib/db";
import { connections } from "@/lib/db/schema";
import { DESK_AUTH_COOKIE, matchDeskCredential } from "@/lib/desk-auth";
import { authorizeOaWrite } from "@/lib/oa/desk-write-auth";
import { decodeJwtExp } from "@/lib/oa/jwt";
import { oaClientMeta } from "@/lib/oa/request-meta";
import { clearOaToken, writeOaAudit } from "@/lib/oa/vault-store";
import { encryptSecret, normalizeVaultSecret, redactLiteral, redactSecrets } from "@/lib/vault";

export interface ActionResult {
  ok: boolean;
  message: string;
}

/**
 * Save a pasted bearer token / cookie string into the Session Vault.
 * Encrypts at rest; upserts on (vendor, kind). Never echoes the secret back.
 */
export async function saveConnection(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const vendor = String(formData.get("vendor") ?? "").trim();
  const kindRaw = String(formData.get("kind") ?? "").trim();
  const label = String(formData.get("label") ?? "").trim() || vendor;
  const secret = String(formData.get("secret") ?? "").trim();
  const feedUrl = String(formData.get("feedUrl") ?? "").trim();
  const apiSid = String(formData.get("apiSid") ?? "").trim();
  const expiresRaw = String(formData.get("expiresAt") ?? "").trim();

  if (!vendor) return { ok: false, message: "Vendor is required." };
  if (kindRaw !== "market_api" && kindRaw !== "vendor_session") {
    return { ok: false, message: "Invalid connection kind." };
  }
  if (!secret) return { ok: false, message: "Paste a token or session string." };

  const confirmSecret = String(formData.get("confirmSecret") ?? "");
  let actor = await deskActor();
  let auditMeta: { ip: string | null; ua: string | null } = { ip: null, ua: null };
  if (vendor === "outdoor_analytics" && kindRaw === "market_api") {
    const gated = await oaWriteFromAction(confirmSecret);
    auditMeta = gated.meta;
    if (!gated.decision.ok) {
      await writeOaAudit("oa_token_failed_attempt", "anonymous", {
        reason: gated.decision.reason,
        source: "manual",
        ip: auditMeta.ip,
        ua: auditMeta.ua,
      }).catch(() => undefined);
      return { ok: false, message: gated.decision.message };
    }
    actor = gated.decision.actor;
  } else if (actor == null) {
    return { ok: false, message: "Unauthorized." };
  }

  const normalized = normalizeVaultSecret(secret);

  const kind = kindRaw as "market_api" | "vendor_session";
  let encrypted: string;
  try {
    encrypted = encryptSecret(normalized);
  } catch (err) {
    const message = `Vault key error: ${redactLiteral(err instanceof Error ? err.message : "key error", normalized)}`;
    if (vendor === "outdoor_analytics") {
      await writeOaAudit("oa_token_failed_attempt", actor, { reason: "vault_key", source: "manual" }).catch(
        () => undefined,
      );
    }
    return { ok: false, message };
  }

  const manualExpiry = expiresRaw ? new Date(expiresRaw) : null;
  const jwtExpiry =
    vendor === "outdoor_analytics" && kindRaw === "market_api" ? decodeJwtExp(normalized) : null;
  const expiresAt = manualExpiry && !Number.isNaN(manualExpiry.getTime()) ? manualExpiry : jwtExpiry;

  const meta: Record<string, unknown> = {};
  if (feedUrl) meta.feedUrl = feedUrl;
  if (apiSid) meta.apiSid = apiSid;

  try {
    const existing = await db
      .select({ meta: connections.meta })
      .from(connections)
      .where(and(eq(connections.vendor, vendor), eq(connections.kind, kind)))
      .limit(1);
    const prevMeta = (existing[0]?.meta as Record<string, unknown> | undefined) ?? {};
    const mergedMeta = { ...prevMeta, ...meta };
    if (vendor === "outdoor_analytics" && kind === "market_api") {
      mergedMeta.lastSetAt = new Date().toISOString();
      mergedMeta.lastProbeAt = null;
      mergedMeta.lastProbeOk = null;
      mergedMeta.lastProbeHttp = null;
    }
    // Allow clearing feed URL / SID only when the form explicitly sent empty and we want replace —
    // keep previous apiSid/feedUrl when the new form left those fields blank.
    if (!feedUrl && prevMeta.feedUrl != null && meta.feedUrl === undefined) {
      mergedMeta.feedUrl = prevMeta.feedUrl;
    }
    if (!apiSid && prevMeta.apiSid != null && meta.apiSid === undefined) {
      mergedMeta.apiSid = prevMeta.apiSid;
    }

    await db
      .insert(connections)
      .values({ vendor, kind, label, secret: encrypted, meta: mergedMeta, status: "active", expiresAt })
      .onConflictDoUpdate({
        target: [connections.vendor, connections.kind],
        set: { label, secret: encrypted, meta: mergedMeta, status: "active", expiresAt, updatedAt: new Date() },
      });
    if (vendor === "outdoor_analytics" && kind === "market_api") {
      await writeOaAudit("oa_token_set", actor, {
        source: "manual",
        expiresAt: expiresAt ? expiresAt.toISOString() : null,
        expirySource: manualExpiry && !Number.isNaN(manualExpiry.getTime()) ? "manual" : jwtExpiry ? "jwt" : "none",
        ip: auditMeta.ip,
        ua: auditMeta.ua,
      });
    }
    revalidatePath("/import");
    return { ok: true, message: `Saved ${label} (${kind}).` };
  } catch (err) {
    const message = redactLiteral(redactSecrets(err instanceof Error ? err.message : "Save failed."), normalized);
    if (vendor === "outdoor_analytics") {
      await writeOaAudit("oa_token_failed_attempt", actor ?? "anonymous", {
        reason: "save_failed",
        source: "manual",
        ip: auditMeta.ip,
        ua: auditMeta.ua,
      }).catch(
        () => undefined,
      );
    }
    return { ok: false, message };
  }
}

export async function revokeConnection(id: string, confirmSecret = ""): Promise<ActionResult> {
  try {
    const rows = await db
      .select({ vendor: connections.vendor, kind: connections.kind })
      .from(connections)
      .where(eq(connections.id, id))
      .limit(1);
    const row = rows[0];
    if (row?.vendor === "outdoor_analytics" && row.kind === "market_api") {
      const gated = await oaWriteFromAction(confirmSecret);
      if (!gated.decision.ok) {
        await writeOaAudit("oa_token_failed_attempt", "anonymous", {
          reason: gated.decision.reason,
          source: "manual",
          ip: gated.meta.ip,
          ua: gated.meta.ua,
        }).catch(() => undefined);
        return { ok: false, message: gated.decision.message };
      }
      await clearOaToken(gated.decision.actor, { ip: gated.meta.ip, ua: gated.meta.ua, source: "manual" });
    } else {
      const actor = await deskActor();
      if (actor == null) return { ok: false, message: "Unauthorized." };
      await db
        .update(connections)
        .set({ status: "revoked", updatedAt: new Date() })
        .where(eq(connections.id, id));
    }
    revalidatePath("/import");
    return { ok: true, message: "Connection revoked." };
  } catch (err) {
    return { ok: false, message: redactSecrets(err instanceof Error ? err.message : "Revoke failed.") };
  }
}

async function requestBits(): Promise<{
  cookieToken: string | null;
  authorizationHeader: string | null;
  origin: string | null;
  meta: { ip: string | null; ua: string | null };
}> {
  const { cookies, headers } = await import("next/headers");
  const jar = await cookies();
  const hdrs = await headers();
  return {
    cookieToken: jar.get(DESK_AUTH_COOKIE)?.value ?? null,
    authorizationHeader: hdrs.get("authorization"),
    origin: hdrs.get("origin"),
    meta: oaClientMeta(hdrs),
  };
}

async function oaWriteFromAction(confirmSecret: string) {
  const bits = await requestBits();
  const decision = await authorizeOaWrite({
    cookieToken: bits.cookieToken,
    authorizationHeader: bits.authorizationHeader,
    origin: bits.origin,
    confirmSecret,
  });
  return { decision, meta: bits.meta };
}

async function deskActor(): Promise<string | null> {
  const bits = await requestBits();
  const match = await matchDeskCredential({
    cookieToken: bits.cookieToken,
    authorizationHeader: bits.authorizationHeader,
  });
  if (match === "none") return null;
  if (match === "open") return "desk-open";
  return match === "bearer" ? "desk-bearer" : "desk-session";
}

/** Form-action wrapper: reads the connection id from the submitted form. */
export async function revokeConnectionAction(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "").trim();
  const confirmSecret = String(formData.get("confirmSecret") ?? "");
  if (id) await revokeConnection(id, confirmSecret);
}
