/**
 * Auth + origin + confirm gate for OA token writes.
 * A Bearer prefix is not enough: the value must match the secret.
 * Missing Origin is allowed only when that bearer itself matched.
 * Production refuses writes when DESK_AUTH_SECRET is unset, unless the
 * configured Desk origin is loopback.
 */

import { DESK_AUTH_COOKIE, matchDeskCredential, type DeskCredentialMatch } from "@/lib/desk-auth";
import { confirmSecretOk } from "@/lib/oa/admin-confirm";
import { deskPublicOrigin, isLoopbackOrigin } from "@/lib/oa/config";

export type OaWriteActor = "desk-session" | "desk-bearer" | "desk-open";

export interface DeskWriteAuth {
  ok: true;
  actor: OaWriteActor;
  match: DeskCredentialMatch;
}

export interface DeskWriteDenied {
  ok: false;
  status: 401 | 403;
  reason: "unauthenticated" | "wrong_origin" | "missing_origin" | "confirm_rejected" | "auth_disabled";
  message: string;
  actor: "anonymous";
}

export async function authorizeOaWrite(input: {
  cookieToken?: string | null;
  authorizationHeader?: string | null;
  origin?: string | null;
  confirmSecret?: string | null;
  /** Set/clear re-prompt. Probes skip this. */
  requireConfirm?: boolean;
}): Promise<DeskWriteAuth | DeskWriteDenied> {
  const match = await matchDeskCredential({
    cookieToken: input.cookieToken,
    authorizationHeader: input.authorizationHeader,
  });

  let deskOrigin: string;
  try {
    deskOrigin = deskPublicOrigin();
  } catch {
    return deny(403, "wrong_origin", "Desk origin is not configured.");
  }

  if (match === "open") {
    if (!oaWritesAllowedWithoutSecret(deskOrigin)) {
      return deny(
        403,
        "auth_disabled",
        "OA token writes are disabled until DESK_AUTH_SECRET is set.",
      );
    }
    if (input.origin && input.origin !== deskOrigin) {
      return deny(403, "wrong_origin", "Refused: token writes are only accepted from this Desk.");
    }
    return { ok: true, actor: "desk-open", match };
  }

  if (match === "none") {
    return deny(
      401,
      "unauthenticated",
      "Unauthorized — sign in at /login or send Authorization: Bearer <DESK_AUTH_SECRET>.",
    );
  }

  if (input.origin) {
    if (input.origin !== deskOrigin) {
      return deny(403, "wrong_origin", "Refused: token writes are only accepted from this Desk.");
    }
  } else if (match !== "bearer") {
    return deny(403, "missing_origin", "Refused: browser token writes must come from this Desk.");
  }

  if (input.requireConfirm !== false && !confirmSecretOk(input.confirmSecret)) {
    return deny(
      403,
      "confirm_rejected",
      "Re-enter the desk secret to set or clear the OA token. If OA_ADMIN_SECRET is set, use that instead.",
    );
  }

  return {
    ok: true,
    actor: match === "bearer" ? "desk-bearer" : "desk-session",
    match,
  };
}

export async function authorizeOaWriteRequest(
  request: Request,
  confirmSecret: string | null,
  opts?: { requireConfirm?: boolean },
): Promise<DeskWriteAuth | DeskWriteDenied> {
  return authorizeOaWrite({
    cookieToken: readCookie(request.headers.get("cookie"), DESK_AUTH_COOKIE),
    authorizationHeader: request.headers.get("authorization"),
    origin: request.headers.get("origin"),
    confirmSecret,
    requireConfirm: opts?.requireConfirm,
  });
}

function oaWritesAllowedWithoutSecret(deskOrigin: string): boolean {
  if (process.env.NODE_ENV !== "production") return true;
  return isLoopbackOrigin(deskOrigin);
}

function deny(status: 401 | 403, reason: DeskWriteDenied["reason"], message: string): DeskWriteDenied {
  return { ok: false, status, reason, message, actor: "anonymous" };
}

function readCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === name) return rest.join("=") || null;
  }
  return null;
}
