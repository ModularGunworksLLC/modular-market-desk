/**
 * POST /api/vault/oa   — save an Outdoor Analytics session JWT (body, never query).
 * DELETE /api/vault/oa — clear it.
 * GET  /api/vault/oa   — bookmarklet source only (no token).
 *
 * Writes require Desk auth, a Desk Origin (or a bearer that itself matches the
 * secret), and a re-entered desk secret or OA_ADMIN_SECRET. The token is not
 * logged and is not written to the audit row.
 */

import { NextResponse } from "next/server";

import { buildOaBookmarkletHref } from "@/lib/oa/bookmarklet";
import { oaSessionStorageKey } from "@/lib/oa/config";
import { authorizeDeskRequest, DESK_AUTH_COOKIE } from "@/lib/desk-auth";
import { authorizeOaWriteRequest } from "@/lib/oa/desk-write-auth";
import { OA_BODY_MAX_CHARS } from "@/lib/oa/jwt";
import { oaClientMeta } from "@/lib/oa/request-meta";
import { OaSaveError, clearOaToken, saveOaToken, writeOaAudit } from "@/lib/oa/vault-store";
import { rateLimitOk } from "@/lib/trade-in/rate-limit";
import { redactLiteral } from "@/lib/vault";

export const runtime = "nodejs";

const WRITE_LIMIT = 30;
const WRITE_WINDOW_MS = 60_000;

export async function GET(request: Request): Promise<NextResponse> {
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
  const parsed = await readJsonLimited(request);
  if (!parsed.ok) {
    return NextResponse.json({ ok: false, message: parsed.message }, { status: parsed.status });
  }
  return writeToken(request, "set", parsed.value);
}

export async function DELETE(request: Request): Promise<NextResponse> {
  const parsed = await readJsonLimited(request);
  if (!parsed.ok) {
    return NextResponse.json({ ok: false, message: parsed.message }, { status: parsed.status });
  }
  return writeToken(request, "clear", parsed.value);
}

async function writeToken(
  request: Request,
  action: "set" | "clear",
  body: unknown,
): Promise<NextResponse> {
  const meta = oaClientMeta(request.headers);
  const ipKey = meta.ip ?? "unknown";
  if (!rateLimitOk(`oa-write:${ipKey}`, WRITE_LIMIT, WRITE_WINDOW_MS)) {
    await auditFailure("anonymous", "rate_limited", request);
    return NextResponse.json({ ok: false, message: "Too many OA token writes. Wait a minute and try again." }, { status: 429 });
  }

  const confirmSecret = readConfirm(body);
  const auth = await authorizeOaWriteRequest(request, confirmSecret);
  if (!auth.ok) {
    await auditFailure(auth.actor, auth.reason, request);
    return NextResponse.json({ ok: false, message: auth.message }, { status: auth.status });
  }

  const auditExtra = { ip: meta.ip, ua: meta.ua };

  if (action === "clear") {
    try {
      await clearOaToken(auth.actor, auditExtra);
      return NextResponse.json({ ok: true, message: "OA token cleared." });
    } catch (err) {
      const message = redactLiteral(err instanceof Error ? err.message : "Clear failed.", confirmSecret);
      await auditFailure(auth.actor, "save_failed", request);
      return NextResponse.json({ ok: false, message }, { status: 500 });
    }
  }

  const token = readTokenField(body);
  if (!token) {
    await auditFailure(auth.actor, "empty_token", request);
    return NextResponse.json({ ok: false, message: "No OA token was provided." }, { status: 400 });
  }

  try {
    const saved = await saveOaToken(token, auth.actor, auditExtra);
    return NextResponse.json({
      ok: true,
      message: saved.message,
      expiresAt: saved.expiresAt.toISOString(),
    });
  } catch (err) {
    const reason = err instanceof OaSaveError ? err.reason : "save_failed";
    const message = redactLiteral(
      redactLiteral(err instanceof Error ? err.message : "OA connect failed.", token),
      confirmSecret,
    );
    await auditFailure(auth.actor, reason, request);
    const status = reason === "vault_key" || reason === "save_failed" ? 500 : 400;
    return NextResponse.json({ ok: false, message }, { status });
  }
}

async function readJsonLimited(
  request: Request,
): Promise<{ ok: true; value: unknown } | { ok: false; status: number; message: string }> {
  const ct = request.headers.get("content-type") ?? "";
  if (!ct.toLowerCase().includes("application/json")) {
    return { ok: false, status: 415, message: "Content-Type must be application/json." };
  }
  const declared = Number(request.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > OA_BODY_MAX_CHARS) {
    return { ok: false, status: 413, message: "Request body is too large." };
  }
  let text = "";
  try {
    text = await request.text();
  } catch {
    return { ok: false, status: 400, message: "Could not read the request body." };
  }
  if (text.length > OA_BODY_MAX_CHARS) {
    return { ok: false, status: 413, message: "Request body is too large." };
  }
  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch {
    return { ok: false, status: 400, message: "Invalid JSON." };
  }
}

function readConfirm(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const value = (body as { confirmSecret?: unknown }).confirmSecret;
  return typeof value === "string" ? value : null;
}

function readTokenField(body: unknown): string {
  if (!body || typeof body !== "object") return "";
  const token = (body as { token?: unknown }).token;
  return typeof token === "string" ? token : "";
}

function readCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === name) return rest.join("=") || null;
  }
  return null;
}

async function auditFailure(actor: string, reason: string, request: Request): Promise<void> {
  const origin = request.headers.get("origin");
  const meta = oaClientMeta(request.headers);
  try {
    await writeOaAudit("oa_token_failed_attempt", actor, {
      reason,
      origin: origin ? origin.slice(0, 200) : null,
      ip: meta.ip,
      ua: meta.ua,
    });
  } catch {
    /* still refuse the write if the audit table is unavailable */
  }
}
