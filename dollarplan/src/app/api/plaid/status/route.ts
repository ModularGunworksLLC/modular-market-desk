import { NextResponse } from "next/server";

import { isPlaidEnabled } from "@/lib/plaid/config";

export async function GET() {
  return NextResponse.json({
    enabled: isPlaidEnabled(),
    message: isPlaidEnabled()
      ? "Plaid credentials detected — sync routes can be enabled."
      : "Manual transactions only. Set PLAID_CLIENT_ID and PLAID_SECRET to enable bank sync later.",
  });
}
