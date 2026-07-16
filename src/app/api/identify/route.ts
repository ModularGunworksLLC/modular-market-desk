import { z } from "zod";
import { NextResponse } from "next/server";

import { IdentifyError, identifyFirearm } from "@/lib/identify";
import { persistIdentifySnapshot } from "@/lib/identify/persist";

export const runtime = "nodejs";
export const maxDuration = 120;

const bodySchema = z.object({
  images: z
    .array(
      z.object({
        mimeType: z.string().min(1),
        dataBase64: z.string().min(1),
      }),
    )
    .max(8)
    .default([]),
  gunType: z.string().optional(),
  hintText: z.string().optional(),
});

export async function POST(request: Request): Promise<NextResponse> {
  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  if (!parsed.data.images.length && !parsed.data.hintText?.trim()) {
    return NextResponse.json({ error: "Provide photos and/or hintText (lot title)." }, { status: 400 });
  }

  try {
    const result = await identifyFirearm(parsed.data);
    const id = await persistIdentifySnapshot({
      source: "counter",
      result,
      hintText: parsed.data.hintText,
    }).catch(() => null);
    return NextResponse.json({ ...result, snapshotId: id });
  } catch (err) {
    if (err instanceof IdentifyError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
