/**
 * GET /api/vault/status
 * Verifies the Session Vault can decrypt the stored OA token with the current SESSION_VAULT_KEY.
 */

import { NextResponse } from "next/server";

import { getMarketToken } from "@/lib/connections";

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

  return NextResponse.json({
    ok: true,
    message: `Vault OK (token length ${token.length}).`,
  });
}
