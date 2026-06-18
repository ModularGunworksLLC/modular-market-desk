import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { seedDefaultPresets } from "@/lib/csv/seed-presets";

export async function POST(): Promise<NextResponse> {
  const result = await seedDefaultPresets();
  if (result.ok) revalidatePath("/import");
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
