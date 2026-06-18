"use server";

import { revalidatePath } from "next/cache";

import { seedDefaultPresets as seed } from "@/lib/csv/seed-presets";

export interface ActionResult {
  ok: boolean;
  message: string;
}

/** @deprecated Prefer POST /api/presets/seed from client components. */
export async function seedDefaultPresets(): Promise<ActionResult> {
  const result = await seed();
  if (result.ok) revalidatePath("/import");
  return result;
}
