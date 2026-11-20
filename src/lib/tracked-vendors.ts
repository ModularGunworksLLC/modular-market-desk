/** Distributors included in wholesale cross-reference grids and dealer-mode source pickers. */

export const TRACKED_VENDORS = [
  "lipseys",
  "zanders",
  "davidsons",
  "chattanooga",
  "orion",
  "2ndamendmentwholesale",
  "rsr",
] as const;

export type TrackedVendor = (typeof TRACKED_VENDORS)[number];

export const VENDOR_LABELS: Record<TrackedVendor, string> = {
  lipseys: "Lipsey's",
  zanders: "Zanders",
  davidsons: "Davidson's",
  chattanooga: "Chattanooga",
  orion: "Orion",
  "2ndamendmentwholesale": "2nd Amendment Wholesale",
  rsr: "RSR Group",
};

/** Vendors that support API/feed catalog sync (token in Session Vault). */
export const API_SYNC_VENDORS = ["lipseys", "2ndamendmentwholesale", "chattanooga"] as const;

export type ApiSyncVendor = (typeof API_SYNC_VENDORS)[number];

export function isApiSyncVendor(name: string): name is ApiSyncVendor {
  return (API_SYNC_VENDORS as readonly string[]).includes(name.toLowerCase());
}

/** Which live feeds to pull for a scan scope (`all` or one API vendor slug). */
export function vendorsToRefresh(vendor: string): ApiSyncVendor[] {
  const raw = vendor.trim().toLowerCase();
  if (raw === "all" || raw === "") return [...API_SYNC_VENDORS];
  if (!isApiSyncVendor(raw)) {
    throw new Error(
      `Live catalog sync is only available for ${API_SYNC_VENDORS.join(", ")} (got "${vendor}").`,
    );
  }
  return [raw];
}

export function vendorLabel(name: string): string {
  const key = name.toLowerCase() as TrackedVendor;
  return VENDOR_LABELS[key] ?? name;
}

export function isTrackedVendor(name: string): boolean {
  return TRACKED_VENDORS.includes(name.toLowerCase() as TrackedVendor);
}
