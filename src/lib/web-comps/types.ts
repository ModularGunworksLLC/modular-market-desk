/** Shared types for web comps (Tavily → local SQLite). */

import type { WebPriceConfidence } from "@/lib/db/schema";

export type WebSearchHit = {
  title: string;
  url: string;
  snippet: string;
};

export type WebIdentity = {
  manufacturer: string;
  model: string;
  caliber?: string;
  variant?: string;
  upc?: string;
  mpn?: string;
  category?: string;
};

export type WebCompsSource = "oa" | "web" | "insufficient" | "none";

/**
 * Live enrich lifecycle for batch / desk badges.
 * - oa / web: money math already using that source
 * - queued / running: drip in progress
 * - ready: high-conf stats now in DB — re-run to apply
 * - weak: enrich finished but below high gate
 * - skipped: budget / not queued
 */
export type WebEnrichPhase =
  | "oa"
  | "web"
  | "queued"
  | "running"
  | "ready"
  | "weak"
  | "skipped"
  | "idle";

export type AskSoldDivergence = "cooling" | "ok" | "asks_rich" | "thin";

export type WebCompsSummary = {
  source: WebCompsSource;
  confidence: WebPriceConfidence | null;
  count: number;
  domainCount: number;
  median: number | null;
  sampleUrls: string[];
  sampleDomains: string[];
  /** Human status for sourceStatus.web */
  note: string;
  /** OA vs web agreement when both present */
  agreement?: "agrees" | "web_higher" | "web_lower" | null;
  /** Ask street vs sold FMV sanity (Cooling = asks well under solds). */
  divergence?: AskSoldDivergence | null;
  canonicalKey?: string;
  enrichPhase?: WebEnrichPhase;
};

export type WebEnrichKeyStatus = {
  phase: WebEnrichPhase;
  confidence: WebPriceConfidence | null;
  count: number;
  domainCount: number;
  median: number | null;
  updatedAt: string | null;
};
