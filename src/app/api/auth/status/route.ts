import { NextResponse } from "next/server";

import { deskAuthEnabled } from "@/lib/desk-auth";

export const runtime = "nodejs";

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ authRequired: deskAuthEnabled() });
}
