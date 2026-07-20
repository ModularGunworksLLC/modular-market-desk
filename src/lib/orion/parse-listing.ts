/** Pure Orion Wholesale listing product shape — no I/O. */

export type OrionListingProduct = {
  productId: string;
  description: string;
  manufacturer: string;
  sku: string;
  upc: string;
  dealerPrice: number | null;
  msrp: number | null;
  inStock: boolean;
  href: string | null;
  category: string;
};
