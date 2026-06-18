import { db } from "@/lib/db";
import { csvPresets } from "@/lib/db/schema";

import { DEFAULT_PRESETS } from "./presets";

export interface SeedPresetsResult {
  ok: boolean;
  message: string;
}

/** Seed default distributor presets (idempotent upsert). */
export async function seedDefaultPresets(): Promise<SeedPresetsResult> {
  try {
    for (const preset of DEFAULT_PRESETS) {
      await db
        .insert(csvPresets)
        .values(preset)
        .onConflictDoUpdate({
          target: csvPresets.vendorName,
          set: {
            label: preset.label,
            delimiter: preset.delimiter ?? ",",
            encoding: preset.encoding ?? "utf-8",
            columnMap: preset.columnMap,
            updatedAt: new Date(),
          },
        });
    }
    return { ok: true, message: `Seeded ${DEFAULT_PRESETS.length} distributor presets.` };
  } catch (err) {
    return { ok: false, message: (err as Error).message };
  }
}
