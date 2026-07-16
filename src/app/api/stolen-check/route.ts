import { z } from "zod";
import { NextResponse } from "next/server";

import { checkHotGunz } from "@/lib/stolen/hotgunz";

export const runtime = "nodejs";
export const maxDuration = 30;

const bodySchema = z.object({
  serial: z.string().min(1),
});

export async function POST(request: Request): Promise<NextResponse> {
  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const result = await checkHotGunz(parsed.data.serial);
  return NextResponse.json(result);
}
