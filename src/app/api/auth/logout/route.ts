import { NextResponse } from "next/server";

import { DESK_AUTH_COOKIE } from "@/lib/desk-auth";

export const runtime = "nodejs";

export async function POST(): Promise<NextResponse> {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(DESK_AUTH_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  return res;
}
