import { NextResponse } from "next/server";
import { z } from "zod";

import { estimateTradeInInterest } from "@/lib/trade-in/estimate";
import { clientIp, rateLimitOk } from "@/lib/trade-in/rate-limit";

export const runtime = "nodejs";

const softEmpty = {
  ok: false,
  estimateP25: null,
  soldCount: 0,
  label: "",
  staffLabel: "",
  message: "Enter make and model for a soft estimate.",
} as const;

const bodySchema = z.object({
  manufacturer: z.string().trim().min(1).max(120),
  model: z.string().trim().min(1).max(120),
  caliber: z
    .string()
    .trim()
    .max(80)
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined)),
});

export async function POST(request: Request) {
  const ip = clientIp(request.headers);
  if (!rateLimitOk(`trade-in-estimate:${ip}`, 30, 60_000)) {
    return NextResponse.json({ error: "Too many requests — try again shortly." }, { status: 429 });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    // Incomplete / aborted typing requests should not surface as hard errors in the browser console.
    return NextResponse.json(softEmpty, { status: 200 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(softEmpty, { status: 200 });
  }

  try {
    const result = await estimateTradeInInterest(parsed.data);
    return NextResponse.json(result);
  } catch (err) {
    console.error("[trade-in/estimate]", err);
    return NextResponse.json(
      {
        ok: false,
        estimateP25: null,
        soldCount: 0,
        label: "",
        staffLabel: "",
        message: "Estimate unavailable — you can still submit with photos for review.",
      },
      { status: 200 },
    );
  }
}
