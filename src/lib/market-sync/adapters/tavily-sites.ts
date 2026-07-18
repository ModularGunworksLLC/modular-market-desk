/**
 * Curated national/regional ask sites via Tavily site: filters for watchlist keys.
 */

import "server-only";

import { upsertStreetObservations, type StreetObservationInput } from "@/lib/market-sync/upsert-obs";
import { parseIdentityFromTitle, parsePriceFromText } from "@/lib/market-sync/parse-title";
import { extractPricesFromText } from "@/lib/web-comps/extract";
import { searchOrganic, tavilyConfigured, TavilyError } from "@/lib/web-comps/tavily";
import type { WebIdentity } from "@/lib/web-comps/types";

export const CURATED_ASK_SITES = [
  { domain: "gunsinternational.com", source: "gunsinternational", geo: "national" as const, kind: "ask" as const },
  { domain: "americanguntrader.com", source: "americanguntrader", geo: "national" as const, kind: "ask" as const },
  { domain: "wikiarms.com", source: "wikiarms", geo: "national" as const, kind: "ask" as const },
  { domain: "guns.com", source: "gunscom", geo: "national" as const, kind: "ask" as const },
  { domain: "theoutdoorstrader.com", source: "outdoorstrader", geo: "SE" as const, kind: "regional_ask" as const },
  { domain: "longrangehunting.com", source: "longrangehunting", geo: "national" as const, kind: "ask" as const },
] as const;

export async function ingestCuratedSitesForIdentities(
  identities: WebIdentity[],
  opts?: { maxPerIdentity?: number; delayMs?: number },
): Promise<{ observations: number; note: string; errors: string[] }> {
  if (!tavilyConfigured()) {
    return { observations: 0, note: "Tavily not configured — skipped curated site asks", errors: [] };
  }
  const maxPer = opts?.maxPerIdentity ?? 2;
  const delayMs = opts?.delayMs ?? 1500;
  const errors: string[] = [];
  let total = 0;
  const limited = identities.slice(0, 40);

  for (const identity of limited) {
    const sites = CURATED_ASK_SITES.slice(0, maxPer);
    for (const site of sites) {
      const q = `site:${site.domain} ${identity.manufacturer} ${identity.model} ${identity.caliber ?? ""} price`.trim();
      try {
        const hits = await searchOrganic(q, { maxResults: 5 });
        const rows: StreetObservationInput[] = [];
        for (const hit of hits) {
          if (!hit.url.includes(site.domain)) continue;
          const prices = extractPricesFromText(`${hit.title} ${hit.snippet}`);
          const price = prices[0] ?? parsePriceFromText(`${hit.title} ${hit.snippet}`);
          if (price == null) continue;
          const parsed = parseIdentityFromTitle(hit.title);
          rows.push({
            identity: parsed
              ? { ...identity, manufacturer: parsed.manufacturer, model: parsed.model }
              : identity,
            price,
            title: hit.title,
            url: hit.url,
            source: site.source,
            kind: site.kind,
            geo: site.geo,
            provider: "tavily",
            query: q,
          });
        }
        if (rows.length) {
          const r = await upsertStreetObservations(rows);
          total += r.insertedOrTouched;
        }
      } catch (e) {
        const msg = e instanceof TavilyError ? e.message : e instanceof Error ? e.message : String(e);
        errors.push(`${site.source}: ${msg}`);
        if (/429|rate/i.test(msg)) break;
      }
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }

  return {
    observations: total,
    note: `Curated Tavily sites: ${total} obs across ${limited.length} identities`,
    errors,
  };
}
