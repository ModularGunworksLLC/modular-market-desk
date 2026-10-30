/**
 * GET  /api/vault/status — stored OA state. Does not call OA and does not return the token.
 * POST /api/vault/status — one live probe. Requires the same origin gate as a token write.
 */

import { NextResponse } from "next/server";

import { authorizeDeskRequest, DESK_AUTH_COOKIE } from "@/lib/desk-auth";
import { GbaApiClient, GbaApiError } from "@/lib/gba/client";
import { authorizeOaWriteRequest } from "@/lib/oa/desk-write-auth";
import { oaClientMeta } from "@/lib/oa/request-meta";
import { loadOaVault, markOaProbeOk, markOaUnauthorized, toPublicOaStatus } from "@/lib/oa/vault-store";
import { rateLimitOk } from "@/lib/trade-in/rate-limit";
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

  try {
    const snap = await loadOaVault();
    return NextResponse.json(toPublicOaStatus(snap));
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

export async function POST(request: Request): Promise<NextResponse> {
  // Probe is not a set/clear, so it does not re-prompt for the secret.
  const auth = await authorizeOaWriteRequest(request, null, { requireConfirm: false });
  if (!auth.ok) {
    return NextResponse.json({ ok: false, message: auth.message }, { status: auth.status });
  }

  const meta = oaClientMeta(request.headers);
  if (!rateLimitOk(`oa-probe:${meta.ip ?? "unknown"}`, 6, 60_000)) {
    return NextResponse.json({ ok: false, message: "Too many OA probes. Wait a minute and try again." }, { status: 429 });
  }

  try {
    let snap = await loadOaVault();
    if (snap.usableToken) {
      const token = snap.usableToken;
      try {
        await new GbaApiClient(token).dependencies();
        await markOaProbeOk();
      } catch (err) {
        if (err instanceof GbaApiError && err.status === 401) {
          await markOaUnauthorized();
        }
        redactLiteral(err instanceof Error ? err.message : "", token);
      }
      snap = await loadOaVault();
    }
    return NextResponse.json(toPublicOaStatus(snap));
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        state: "not_connected",
        message: redactLiteral(err instanceof Error ? err.message : "Could not probe OA.", null),
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
