/**
 * GET /api/vault/status
 * Verifies vault decrypt + Outdoor Analytics token still accepted (not just present).
 */

import { NextResponse } from "next/server";

import { getMarketToken } from "@/lib/connections";
import { GbaApiClient, GbaApiError } from "@/lib/gba/client";

export const runtime = "nodejs";

export async function GET(): Promise<NextResponse> {
  const hasKey = Boolean(process.env.SESSION_VAULT_KEY?.trim());
  if (!hasKey) {
    return NextResponse.json({
      ok: false,
      message: "SESSION_VAULT_KEY is missing. Add it to .env and restart the server.",
    });
  }

  const token = await getMarketToken();
  if (!token) {
    return NextResponse.json({
      ok: false,
      message:
        "Cannot decrypt the saved token with this SESSION_VAULT_KEY. Re-paste your Bearer token on Import → Connections and save again.",
    });
  }

  try {
    await new GbaApiClient(token).dependencies();
    return NextResponse.json({
      ok: true,
      message: `Vault OK — Outdoor Analytics accepts token (len ${token.length}).`,
      oaAuth: "ok",
    });
  } catch (err) {
    const status = err instanceof GbaApiError ? err.status : 0;
    return NextResponse.json({
      ok: false,
      oaAuth: "unauthorized",
      message:
        status === 401
          ? `Vault decrypts a token (len ${token.length}) but Outdoor Analytics rejects it — re-paste a fresh Bearer token on Import → Connections.`
          : `Vault has a token but OA probe failed: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
}
