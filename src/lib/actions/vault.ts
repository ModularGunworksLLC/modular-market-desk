"use server";

import { eq } from "drizzle-orm";
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

  try {
    await db
      .insert(connections)
      .values({ vendor, kind, label, secret: encrypted, meta, status: "active", expiresAt })
      .onConflictDoUpdate({
        target: [connections.vendor, connections.kind],
        set: { label, secret: encrypted, meta, status: "active", expiresAt, updatedAt: new Date() },
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
