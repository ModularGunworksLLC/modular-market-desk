/**
 * Build a public GunBroker listing URL from an API item id or URL fragment.
 * Current site format: https://www.gunbroker.com/item/{numericId}
 */

export function gunBrokerListingUrl(itemId: string | number | null | undefined): string | null {
  if (itemId == null) return null;
  const raw = String(itemId).trim();
  if (!raw) return null;

  const pathMatch = raw.match(/gunbroker\.com\/item\/(\d+)/i);
  if (pathMatch) return `https://www.gunbroker.com/item/${pathMatch[1]}`;

  const queryMatch = raw.match(/[?&]ItemID=(\d+)/i);
  if (queryMatch) return `https://www.gunbroker.com/item/${queryMatch[1]}`;

  const digits = raw.replace(/\D/g, "");
  if (!digits) return null;
  return `https://www.gunbroker.com/item/${digits}`;
}

/** Normalize an active-listings API row to a numeric item id string. */
export function extractGunBrokerItemId(row: Record<string, unknown>): string | null {
  for (const key of ["ItemURL", "ListingURL", "ItemUrl", "Url", "Link"] as const) {
    const url = gunBrokerListingUrl(String(row[key] ?? ""));
    if (url) return url.split("/").pop() ?? null;
  }
  for (const key of ["ItemID", "ItemId", "itemID", "ListingID", "ID"] as const) {
    const v = row[key];
    if (v == null || v === "") continue;
    const url = gunBrokerListingUrl(String(v));
    if (url) return url.split("/").pop() ?? null;
  }
  return null;
}
