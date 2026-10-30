/**
 * POST /api/vault/oa   — save an Outdoor Analytics session JWT (body, never query).
 * DELETE /api/vault/oa — clear it.
 *
 * Desk auth is required. Browser callers must send Origin equal to the Desk
 * origin. There is no CORS allow-list: the OA page never calls this route.
 * The token is not logged and is not written to the audit row.
 */

import { NextResponse } from "next/server";

import { buildOaBookmarkletHref } from "@/lib/oa/bookmarklet";
import { oaSessionStorageKey } from "@/lib/oa/config";
import { authorizeDeskRequest, DESK_AUTH_COOKIE } from "@/lib/desk-auth";
import { authorizeOaWrite } from "@/lib/oa/desk-write-auth";
import { OaSaveError, clearOaToken, saveOaToken, writeOaAudit } from "@/lib/oa/vault-store";
import { redactLiteral } from "@/lib/vault";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<NextResponse> {
  // Bookmarklet source only — no token. Same-origin GET often omits Origin, so this
  // read is gated by Desk auth and not by the write-origin check.
  const allowed = await authorizeDeskRequest({
    cookieToken: readCookie(request.headers.get("cookie"), DESK_AUTH_COOKIE),
    authorizationHeader: request.headers.get("authorization"),
  });
  if (!allowed) {
    return NextResponse.json(
      { ok: false, message: "Unauthorized — sign in at /login." },
      { status: 401 },
    );
  }
  try {
    return NextResponse.json({
      ok: true,
      href: buildOaBookmarkletHref(),
      storageKey: oaSessionStorageKey(),
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, message: redactLiteral(err instanceof Error ? err.message : "Bookmarklet unavailable.", null) },
      { status: 500 },
    );
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  const auth = await authorizeOaWrite(request);
  if (!auth.ok) {
    await auditFailure(auth.actor, auth.reason, request);
    return NextResponse.json({ ok: false, message: auth.message }, { status: auth.status });
  }

  const token = await readToken(request);
  if (!token) {
    await auditFailure(auth.actor, "empty_token", request);
    return NextResponse.json({ ok: false, message: "No OA token was provided." }, { status: 400 });
  }

  try {
    const saved = await saveOaToken(token, auth.actor);
    return NextResponse.json({
      ok: true,
      message: saved.message,
      expiresAt: saved.expiresAt.toISOString(),
    });
  } catch (err) {
    const reason = err instanceof OaSaveError ? err.reason : "save_failed";
    const message = redactLiteral(err instanceof Error ? err.message : "OA connect failed.", token);
    await auditFailure(auth.actor, reason, request);
    const status = reason === "vault_key" || reason === "save_failed" ? 500 : 400;
    return NextResponse.json({ ok: false, message }, { status });
  }
}

export async function DELETE(request: Request): Promise<NextResponse> {
  const auth = await authorizeOaWrite(request);
  if (!auth.ok) {
    await auditFailure(auth.actor, auth.reason, request);
    return NextResponse.json({ ok: false, message: auth.message }, { status: auth.status });
  }
  try {
    await clearOaToken(auth.actor);
    return NextResponse.json({ ok: true, message: "OA token cleared." });
  } catch (err) {
    const message = redactLiteral(err instanceof Error ? err.message : "Clear failed.", null);
    await auditFailure(auth.actor, "save_failed", request);
    return NextResponse.json({ ok: false, message }, { status: 500 });
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

async function readToken(request: Request): Promise<string> {
  try {
    const body = (await request.json()) as unknown;
    if (!body || typeof body !== "object") return "";
    const token = (body as { token?: unknown }).token;
    return typeof token === "string" ? token : "";
  } catch {
    return "";
  }
}

async function auditFailure(actor: string, reason: string, request: Request): Promise<void> {
  const origin = request.headers.get("origin");
  try {
    await writeOaAudit("oa_token_failed_attempt", actor, {
      reason,
      origin: origin ? origin.slice(0, 200) : null,
    });
  } catch {
    /* still refuse the write if the audit table is unavailable */
  }
}
