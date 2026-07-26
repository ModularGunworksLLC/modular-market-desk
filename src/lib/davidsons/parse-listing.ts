/**
 * Davidson's site listing product (category scrape — inventory CSV is firearms-only).
 */
export interface DavidsonsListingProduct {
  sku: string | null;
  mfgSku?: string | null;
  upc: string | null;
  name: string;
  href?: string | null;
  category: string;
  caliber?: string | null;
  msrp: number | null;
  dealerPrice: number;
  inStock: boolean;
  qty: number | null;
}
