/**
 * Dev-only stand-in for the Outdoor Analytics page.
 * Not a public/ file, so encoded paths cannot fetch a static copy in production.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { NextResponse } from "next/server";

import { localTestPageEnabled } from "@/lib/oa/dev-only";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(): Response {
  if (!localTestPageEnabled(process.env.NODE_ENV, process.env.OA_MOCK_PAGE)) {
    return new NextResponse("Not found", { status: 404 });
  }
  const html = readFileSync(join(process.cwd(), "src/lib/oa/oa-mock.html"), "utf8");
  return new NextResponse(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
