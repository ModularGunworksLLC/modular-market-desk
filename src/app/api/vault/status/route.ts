/**
 * GET /api/vault/status
 * OA connection state for the desk banners. Does not return the token.
 * A live probe runs only when `?probe=1` is set (the Connect OA "Re-check" button).
 */

import { NextResponse } from "next/server";

import { authorizeDeskRequest, DESK_AUTH_COOKIE } from "@/lib/desk-auth";
import { GbaApiClient, GbaApiError } from "@/lib/gba/client";
import { loadOaVault, markOaProbeOk, markOaUnauthorized, toPublicOaStatus } from "@/lib/oa/vault-store";
import { redactLiteral } from "@/lib/vault";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<NextResponse> {
  const allowed = await authorizeDeskRequest({
    cookieToken: readCookie(request.headers.get("cookie"), DESK_AUTH_COOKIE),
    authorizationHeader: request.headers.get("authorization"),
  });
  if (!allowed) {
    return NextResponse.json(
      { ok: false, state: "not_connected", message: "Unauthorized — sign in at /login." },
      { status: 401 },
    );
  }

  const hasKey = Boolean(process.env.SESSION_VAULT_KEY?.trim());
  if (!hasKey) {
    return NextResponse.json({
      ok: false,
      state: "not_connected",
      message: "SESSION_VAULT_KEY is missing. Add it to .env and restart the server.",
      connectHref: "/import#connect-oa",
    });
  }

  const url = new URL(request.url);
  const probe = url.searchParams.get("probe") === "1";

  try {
    let snap = await loadOaVault();
    if (probe && snap.usableToken) {
      const token = snap.usableToken;
      try {
        await new GbaApiClient(token).dependencies();
        await markOaProbeOk();
      } catch (err) {
        if (err instanceof GbaApiError && err.status === 401) {
          await markOaUnauthorized();
        }
        // Network and 5xx failures leave the stored auth state alone.
        // The error string is redacted and discarded so a probe failure cannot log the token.
        redactLiteral(err instanceof Error ? err.message : "", token);
      }
      snap = await loadOaVault();
    }
    const pub = toPublicOaStatus(snap);
    return NextResponse.json(pub);
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        state: "not_connected",
        message: redactLiteral(err instanceof Error ? err.message : "Could not read OA status.", null),
        connectHref: "/import#connect-oa",
      },
      { status: 500 },
    );
  }
}

function readCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === name) return rest.join("=") || null;
  }
  return null;
}
