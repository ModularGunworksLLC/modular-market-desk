/**
 * Ingest Tavily hits into web_price_observations and recompute web_price_stats.
 */

import "server-only";

import { desc, eq, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { webPriceObservations, webPriceStats } from "@/lib/db/schema";

import {
  aggregatePrices,
  buildSearchQuery,
  scoreWebConfidence,
  webCanonicalKey,
} from "./aggregate";
import { domainFromUrl, extractPricesFromText } from "./extract";
import { searchOrganic, TavilyError, tavilyConfigured } from "./tavily";
import type { WebIdentity } from "./types";

export async function loadWebPriceStats(canonicalKey: string) {
  const rows = await db
    .select()
    .from(webPriceStats)
    .where(eq(webPriceStats.canonicalKey, canonicalKey))
    .limit(1);
  return rows[0] ?? null;
}

export async function recomputeStats(
  key: string,
  identity: Pick<WebIdentity, "manufacturer" | "model" | "caliber">,
): Promise<typeof webPriceStats.$inferSelect | null> {
  const obs = await db
    .select()
    .from(webPriceObservations)
    .where(eq(webPriceObservations.canonicalKey, key))
    .orderBy(desc(webPriceObservations.observedAt));

  if (obs.length === 0) {
    await db.delete(webPriceStats).where(eq(webPriceStats.canonicalKey, key));
    return null;
  }

  const prices = obs.map((o) => o.price);
  const agg = aggregatePrices(prices);
  const domains = [...new Set(obs.map((o) => o.sourceDomain).filter(Boolean))];
  const newest = obs[0]?.observedAt ?? null;
  const confidence = scoreWebConfidence({
    domainCount: domains.length,
    p25: agg.p25 ?? 0,
    p75: agg.p75 ?? 0,
    newestObservedAt: newest instanceof Date ? newest : newest ? new Date(newest) : null,
  });

  const sampleUrls = [...new Set(obs.map((o) => o.sourceUrl))].slice(0, 8);
  const sampleDomains = domains.slice(0, 8);

  await db
    .insert(webPriceStats)
    .values({
      canonicalKey: key,
      manufacturer: identity.manufacturer,
      model: identity.model,
      caliber: identity.caliber ?? "",
      count: agg.count,
      domainCount: domains.length,
      low: agg.low,
      p25: agg.p25,
      median: agg.median,
      p75: agg.p75,
      high: agg.high,
      confidence,
      sampleUrls,
      sampleDomains,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: webPriceStats.canonicalKey,
      set: {
        count: agg.count,
        domainCount: domains.length,
        low: agg.low,
        p25: agg.p25,
        median: agg.median,
        p75: agg.p75,
        high: agg.high,
        confidence,
        sampleUrls,
        sampleDomains,
        updatedAt: new Date(),
        manufacturer: identity.manufacturer,
        model: identity.model,
        caliber: identity.caliber ?? "",
      },
    });

  return loadWebPriceStats(key);
}

export type EnrichResult = {
  ok: boolean;
  canonicalKey: string;
  inserted: number;
  hits: number;
  stats: Awaited<ReturnType<typeof loadWebPriceStats>>;
  error?: string;
};

/** Call Tavily, parse prices, upsert observations, recompute stats. */
export async function enrichIdentity(identity: WebIdentity): Promise<EnrichResult> {
  const key = webCanonicalKey(identity);
  if (!tavilyConfigured()) {
    return {
      ok: false,
      canonicalKey: key,
      inserted: 0,
      hits: 0,
      stats: await loadWebPriceStats(key),
      error: "TAVILY_API_KEY is not set.",
    };
  }

  const query = buildSearchQuery(identity);
  let hits;
  try {
    hits = await searchOrganic(query, { maxResults: 10 });
  } catch (err) {
    const msg = err instanceof TavilyError ? err.message : err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      canonicalKey: key,
      inserted: 0,
      hits: 0,
      stats: await loadWebPriceStats(key),
      error: msg,
    };
  }

  const beforeRows = await db
    .select({ n: sql<number>`count(*)` })
    .from(webPriceObservations)
    .where(eq(webPriceObservations.canonicalKey, key));
  const before = Number(beforeRows[0]?.n ?? 0);

  const now = new Date();
  for (const hit of hits) {
    const domain = domainFromUrl(hit.url);
    if (!domain) continue;
    const prices = extractPricesFromText(`${hit.title} ${hit.snippet}`);
    for (const price of prices.slice(0, 2)) {
      try {
        await db
          .insert(webPriceObservations)
          .values({
            canonicalKey: key,
            manufacturer: identity.manufacturer,
            model: identity.model,
            caliber: identity.caliber ?? "",
            variant: identity.variant ?? "",
            upc: identity.upc || null,
            mpn: identity.mpn || null,
            price,
            listingTitle: hit.title.slice(0, 500),
            sourceUrl: hit.url.slice(0, 1000),
            sourceDomain: domain,
            query,
            provider: "tavily",
            source: "tavily",
            kind: "ask",
            geo: "national",
            observedAt: now,
          })
          .onConflictDoNothing();
      } catch {
        /* unique conflict or bad row */
      }
    }
  }

  const afterRows = await db
    .select({ n: sql<number>`count(*)` })
    .from(webPriceObservations)
    .where(eq(webPriceObservations.canonicalKey, key));
  const after = Number(afterRows[0]?.n ?? 0);
  const inserted = Math.max(0, after - before);

  const stats = await recomputeStats(key, identity);
  return { ok: true, canonicalKey: key, inserted, hits: hits.length, stats };
}

export async function statsAreFreshHigh(key: string, maxAgeMs = 14 * 24 * 60 * 60 * 1000): Promise<boolean> {
  const s = await loadWebPriceStats(key);
  if (!s || s.confidence !== "high" || s.count < 3) return false;
  const updated = s.updatedAt instanceof Date ? s.updatedAt : new Date(s.updatedAt);
  return Date.now() - updated.getTime() <= maxAgeMs;
}
