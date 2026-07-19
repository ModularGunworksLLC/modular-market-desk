/**
 * Heuristic firearm category for Markets aggregates.
 * OA leaves have no category — derive from model + caliber text.
 */

import type { MarketsFirearmCategory } from "./types";

export type { MarketsFirearmCategory } from "./types";

export function inferMarketCategory(
  model: string | null | undefined,
  caliber: string | null | undefined,
  manufacturer?: string | null,
): MarketsFirearmCategory {
  const blob = `${manufacturer ?? ""} ${model ?? ""} ${caliber ?? ""}`.toLowerCase();

  if (
    /\b(shotgun|gauge|guage|over\/under|o\/u|double-?barrel|pump\s*action|super\s*x4|sx4|silver\s*pigeon|citori|a400|sbe|maxus)\b/.test(
      blob,
    ) ||
    /\b(12|16|20|28)\s*-?\s*(ga|gauge|guage)\b/.test(blob) ||
    /\b\.?410(\s*(ga|gauge|bore))?\b/.test(blob)
  ) {
    return "shotgun";
  }

  if (
    /\b(rifle|carbine|ar-?15|ar15|ar-?10|bolt\s*action|lever\s*action|long\s*gun|rimfire|ridge|timber|traverse|cascade|axis|mark\s*ii|mark\s*v|x-?bolt|mesa|elevation|outfitter|singleshot|scout|patriot|t3x)\b/.test(
      blob,
    )
  ) {
    return "rifle";
  }

  // Rifle-primary OEMs with bare model names (e.g. Bergara "Ridge")
  if (
    /\b(bergara|christensen|weatherby|cva|proof\s*research|fierce|tikka|sako|howa|marlin|traditions)\b/.test(
      blob,
    ) &&
    !/\b(pistol|handgun|revolver)\b/.test(blob)
  ) {
    return "rifle";
  }

  // Common long-gun calibers when model text is bare (e.g. "M&P 15" + "5.56 NATO")
  if (
    /\b(5\.56|223\s*rem|\.223|308\s*win|\.308|7\.62|30-06|30\/06|6\.5\s*creed|300\s*blk|6\.5\s*grendel|270\s*win|243\s*win|22-250|7mm\s*rem|6mm\s*arc)\b/.test(
      blob,
    ) &&
    !/\b(pistol|handgun|revolver|pcc)\b/.test(blob)
  ) {
    return "rifle";
  }

  return "handgun";
}
