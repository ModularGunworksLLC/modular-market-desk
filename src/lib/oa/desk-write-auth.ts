/**
 * Auth + origin gate for OA token writes.
 * Desk has one shared secret and no role table, so "admin" is that same gate.
 * Browser writes must come from the Desk origin. A missing Origin is accepted
 * only for a bearer script (curl), never for a cookie-only browser POST.
 */

import { authorizeDeskRequest, DESK_AUTH_COOKIE } from "@/lib/desk-auth";
import { deskPublicOrigin } from "@/lib/oa/config";

export interface DeskWriteAuth {
  ok: true;
  actor: "desk-session" | "desk-bearer" | "desk-open";
}

export interface DeskWriteDenied {
  ok: false;
  status: 401 | 403;
  reason: "unauthenticated" | "wrong_origin" | "missing_origin";
  message: string;
  actor: "anonymous";
}

export async function authorizeOaWrite(request: Request): Promise<DeskWriteAuth | DeskWriteDenied> {
  const authorizationHeader = request.headers.get("authorization");
  const cookieToken = readCookie(request.headers.get("cookie"), DESK_AUTH_COOKIE);
  const allowed = await authorizeDeskRequest({ cookieToken, authorizationHeader });
  if (!allowed) {
    return {
      ok: false,
      status: 401,
      reason: "unauthenticated",
      actor: "anonymous",
      message: "Unauthorized — sign in at /login or send Authorization: Bearer <DESK_AUTH_SECRET>.",
    };
  }

  const origin = request.headers.get("origin");
  let deskOrigin: string;
  try {
    deskOrigin = deskPublicOrigin();
  } catch {
    return {
      ok: false,
      status: 403,
      reason: "wrong_origin",
      actor: "anonymous",
      message: "Desk origin is not configured.",
    };
  }

  if (origin) {
    if (origin !== deskOrigin) {
      return {
        ok: false,
        status: 403,
        reason: "wrong_origin",
        actor: "anonymous",
        message: "Refused: token writes are only accepted from this Desk.",
      };
    }
  } else {
    const bearer = authorizationHeader?.trim().toLowerCase().startsWith("bearer ") ?? false;
    if (!bearer) {
      return {
        ok: false,
        status: 403,
        reason: "missing_origin",
        actor: "anonymous",
        message: "Refused: browser token writes must come from this Desk.",
      };
    }
  }

  const bearer = authorizationHeader?.trim().toLowerCase().startsWith("bearer ") ?? false;
  if (!process.env.DESK_AUTH_SECRET?.trim()) {
    return { ok: true, actor: "desk-open" };
  }
  return { ok: true, actor: bearer ? "desk-bearer" : "desk-session" };
}

function readCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === name) return rest.join("=") || null;
  }
  return null;
}
