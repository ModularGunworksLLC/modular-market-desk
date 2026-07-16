import { randomUUID } from "node:crypto";

import { db } from "@/lib/db";
import { identifies } from "@/lib/db/schema";
import type { IdentifyResult } from "@/lib/identify/types";

export async function persistIdentifySnapshot(opts: {
  source: "counter" | "auction";
  result: IdentifyResult;
  lot?: string;
  hintText?: string;
  stolenStatus?: string;
}): Promise<string> {
  const id = randomUUID();
  const { identity, modelUsed } = opts.result;
  await db.insert(identifies).values({
    id,
    source: opts.source,
    lot: opts.lot ?? null,
    manufacturer: identity.manufacturer,
    model: identity.model,
    variant: identity.variant || null,
    caliber: identity.caliber || null,
    category: identity.category,
    condition: identity.condition,
    serial: identity.serial || null,
    confidence: identity.confidence,
    modelUsed,
    stolenStatus: opts.stolenStatus ?? null,
    hintText: opts.hintText ?? null,
    raw: opts.result,
  });
  return id;
}
