/** Props-safe types for the /import dashboard (no server-only imports). */

export interface ConnectionView {
  id: string;
  vendor: string;
  kind: "market_api" | "vendor_session";
  label: string;
  status: string;
  updatedAt: string;
  expiresAt: string | null;
}
