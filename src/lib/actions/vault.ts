"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/lib/db";
import { connections } from "@/lib/db/schema";
import { encryptSecret, normalizeVaultSecret } from "@/lib/vault";

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

  const normalized = normalizeVaultSecret(secret);

  const kind = kindRaw as "market_api" | "vendor_session";
  let encrypted: string;
  try {
    encrypted = encryptSecret(normalized);
  } catch (err) {
    return { ok: false, message: `Vault key error: ${(err as Error).message}` };
  }

  const expiresAt = expiresRaw ? new Date(expiresRaw) : null;

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
    revalidatePath("/import");
    return { ok: true, message: `Saved ${label} (${kind}).` };
  } catch (err) {
    return { ok: false, message: (err as Error).message };
  }
}

export async function revokeConnection(id: string): Promise<ActionResult> {
  try {
    await db
      .update(connections)
      .set({ status: "revoked", updatedAt: new Date() })
      .where(eq(connections.id, id));
    revalidatePath("/import");
    return { ok: true, message: "Connection revoked." };
  } catch (err) {
    return { ok: false, message: (err as Error).message };
  }
}

/** Form-action wrapper: reads the connection id from the submitted form. */
export async function revokeConnectionAction(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "").trim();
  if (id) await revokeConnection(id);
}
