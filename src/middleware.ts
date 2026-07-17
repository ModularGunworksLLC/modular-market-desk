import { NextResponse, type NextRequest } from "next/server";

import {
  authorizeDeskRequest,
  DESK_AUTH_COOKIE,
  deskAuthEnabled,
} from "@/lib/desk-auth";

/** Public paths when desk auth is enabled. */
const PUBLIC_PATHS = ["/login", "/api/auth/login", "/api/auth/logout", "/api/auth/status"];

export function middleware(request: NextRequest) {
  if (!deskAuthEnabled()) {
    return NextResponse.next();
  }

  const { pathname } = request.nextUrl;
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return NextResponse.next();
  }

  // Static / Next internals
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.endsWith(".ico") ||
    pathname.endsWith(".png") ||
    pathname.endsWith(".svg")
  ) {
    return NextResponse.next();
  }

  const ok = authorizeDeskRequest({
    cookieToken: request.cookies.get(DESK_AUTH_COOKIE)?.value,
    authorizationHeader: request.headers.get("authorization"),
  });

  if (ok) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json(
      { error: "Unauthorized — sign in at /login or send Authorization: Bearer <DESK_AUTH_SECRET>." },
      { status: 401 },
    );
  }

  const login = new URL("/login", request.url);
  login.searchParams.set("next", pathname);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
