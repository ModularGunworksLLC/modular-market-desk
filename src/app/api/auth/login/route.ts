import { NextResponse } from "next/server";
import { z } from "zod";

import {
  DESK_AUTH_COOKIE,
  deskAuthEnabled,
  deskAuthSecret,
  mintDeskSessionToken,
  secretsMatch,
} from "@/lib/desk-auth";
import { oaClientMeta } from "@/lib/oa/request-meta";
import { rateLimitOk } from "@/lib/trade-in/rate-limit";

export const runtime = "nodejs";

const bodySchema = z.object({
  secret: z.string().min(1),
});

const LOGIN_LIMIT = 10;
const LOGIN_WINDOW_MS = 60_000;

export async function POST(request: Request): Promise<NextResponse> {
  const ip = oaClientMeta(request.headers).ip ?? "unknown";
  if (!rateLimitOk(`desk-login:${ip}`, LOGIN_LIMIT, LOGIN_WINDOW_MS)) {
    return NextResponse.json({ error: "Too many login attempts. Wait a minute and try again." }, { status: 429 });
  }

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
  if (!(await secretsMatch(presented, expected))) {
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
