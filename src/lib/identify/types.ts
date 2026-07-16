/** Structured firearm identity from vision — dollars come from OA, not here. */

export type FirearmCategory = "handgun" | "rifle" | "shotgun" | "other";

export interface FirearmIdentity {
  manufacturer: string;
  model: string;
  variant: string;
  caliber: string;
  category: FirearmCategory;
  condition: "new" | "used" | "any";
  conditionNotes: string;
  serial: string;
  accessories: string[];
  confidence: number;
  warnings: string[];
  candidates: Array<{
    manufacturer: string;
    model: string;
    variant: string;
    caliber: string;
    reason: string;
  }>;
}

export interface IdentifyImage {
  mimeType: string;
  /** Raw base64 without data: URL prefix */
  dataBase64: string;
}

export interface IdentifyRequest {
  images: IdentifyImage[];
  /** Optional counter hint: handgun | rifle | shotgun */
  gunType?: string;
  /** Auction title or staff notes — can identify from title alone when images empty */
  hintText?: string;
}

export interface IdentifyResult {
  identity: FirearmIdentity;
  modelUsed: string;
  /** Desk evaluate payload fields (subset) */
  evaluateDefaults: {
    manufacturer: string;
    model: string;
    caliber: string;
    category: string;
    condition: "new" | "used" | "any";
  };
}
