/**
 * Extra confirmation for OA token set/clear.
 *
 * Default: re-enter DESK_AUTH_SECRET on every set/clear.
 * If OA_ADMIN_SECRET is set, that value is required instead, so holding a
 * Desk session is not enough to write the vault.
 * When neither secret is set, confirmation is skipped (local dev only — production
 * writes are refused separately).
 */

import { secretsMatch } from "@/lib/desk-auth";

export type OaConfirmMode = "oa_admin" | "desk_secret" | "none";

export function oaAdminConfirmConfig(): { required: boolean; mode: OaConfirmMode; label: string } {
  if (process.env.OA_ADMIN_SECRET?.trim()) {
    return { required: true, mode: "oa_admin", label: "OA admin secret" };
  }
  if (process.env.DESK_AUTH_SECRET?.trim()) {
    return { required: true, mode: "desk_secret", label: "Desk secret" };
  }
  return { required: false, mode: "none", label: "" };
}

export async function confirmSecretOk(presented: string | null | undefined): Promise<boolean> {
  const cfg = oaAdminConfirmConfig();
  if (!cfg.required) return true;
  const expected =
    cfg.mode === "oa_admin"
      ? process.env.OA_ADMIN_SECRET?.trim() ?? ""
      : process.env.DESK_AUTH_SECRET?.trim() ?? "";
  if (!expected) return false;
  return secretsMatch(presented?.trim() ?? "", expected);
}
