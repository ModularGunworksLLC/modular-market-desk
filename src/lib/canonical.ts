/** Stable canonical key for a firearm identity (used to index/dedupe valuations). */

export function canonicalKey(q: {
  category?: string;
  manufacturer: string;
  model: string;
  caliber?: string;
  condition?: string;
}): string {
  return [q.category ?? "", q.manufacturer, q.model, q.caliber ?? "", q.condition ?? "any"]
    .map((p) => p.trim().toLowerCase().replace(/\s+/g, " "))
    .join("|");
}
