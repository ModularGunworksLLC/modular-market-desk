import { NextResponse } from "next/server";
import { z } from "zod";

import {
  DESK_AUTH_COOKIE,
  deskAuthEnabled,
  deskAuthSecret,
  mintDeskSessionToken,
} from "@/lib/desk-auth";

export const runtime = "nodejs";

const bodySchema = z.object({
  secret: z.string().min(1),
});

function secretsMatch(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export async function POST(request: Request): Promise<NextResponse> {
  if (!deskAuthEnabled()) {
    return NextResponse.json({ ok: true, authRequired: false });
  }

  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Secret required." }, { status: 400 });
  }

  const expected = deskAuthSecret()!;
  const presented = parsed.data.secret.trim();
  if (!secretsMatch(presented, expected)) {
    return NextResponse.json({ error: "Invalid desk secret." }, { status: 401 });
  }

  const token = await mintDeskSessionToken(expected);
  const res = NextResponse.json({ ok: true, authRequired: true });
  res.cookies.set(DESK_AUTH_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });
  return res;
}
