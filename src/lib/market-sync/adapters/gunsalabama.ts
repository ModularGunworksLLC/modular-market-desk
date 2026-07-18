/**
 * GunsAlabama.com classifieds → local_ask observations.
 */

import "server-only";

import { parseIdentityFromTitle, parsePriceFromText } from "@/lib/market-sync/parse-title";
import type { StreetObservationInput } from "@/lib/market-sync/upsert-obs";

const FIREARMS_URL = "https://gunsalabama.com/classifieds/firearms";

export async function ingestGunsAlabama(opts?: {
  maxPages?: number;
}): Promise<{ observations: StreetObservationInput[]; note: string }> {
  const maxPages = opts?.maxPages ?? 3;
  const observations: StreetObservationInput[] = [];
  const seen = new Set<string>();

  for (let page = 1; page <= maxPages; page++) {
    const url = page === 1 ? FIREARMS_URL : `${FIREARMS_URL}?page=${page}`;
    let html: string;
    try {
      const res = await fetch(url, {
        headers: {
          Accept: "text/html",
          "User-Agent": "ModularMarketDesk/1.0 (+local market comps; weekly sync)",
        },
        signal: AbortSignal.timeout(45_000),
      });
      if (!res.ok) {
        return {
          observations,
          note: `GunsAlabama HTTP ${res.status} on page ${page}`,
        };
      }
      html = await res.text();
    } catch (e) {
      return {
        observations,
        note: `GunsAlabama fetch failed: ${e instanceof Error ? e.message : String(e)}`,
      };
    }

    // Cards: title in heading/link + price like 1,450.00 USD or $1450
    const blocks = html.split(/<article|class="[^"]*listing|class="[^"]*ad-item/i);
    const chunk = blocks.length > 1 ? blocks : [html];
    for (const block of chunk) {
      const link =
        block.match(/href="(https?:\/\/gunsalabama\.com\/classifieds\/[^"]+)"/i)?.[1] ??
        block.match(/href="(\/classifieds\/firearms\/ad\/[^"]+)"/i)?.[1];
      if (!link) continue;
      const abs = link.startsWith("http") ? link : `https://gunsalabama.com${link}`;
      const title =
        block.match(/<(?:h[1-4]|a)[^>]*>([^<]{8,160})<\/(?:h[1-4]|a)>/i)?.[1]?.trim() ??
        block.match(/title="([^"]{8,160})"/i)?.[1]?.trim();
      if (!title) continue;
      const price =
        parsePriceFromText(block) ??
        (() => {
          const m = block.match(/([0-9]{2,5}(?:\.[0-9]{2})?)\s*USD/i);
          return m?.[1] ? Number(m[1]) : null;
        })();
      if (price == null || price < 50) continue;
      const id = parseIdentityFromTitle(title);
      if (!id) continue;
      const dedupe = `${abs}|${price}`;
      if (seen.has(dedupe)) continue;
      seen.add(dedupe);
      observations.push({
        identity: { manufacturer: id.manufacturer, model: id.model, category: "firearm" },
        price,
        title,
        url: abs,
        source: "gunsalabama",
        kind: "local_ask",
        geo: "AL",
        provider: "gunsalabama",
        query: FIREARMS_URL,
      });
    }

    await new Promise((r) => setTimeout(r, 800));
  }

  return {
    observations,
    note: `GunsAlabama: ${observations.length} local asks`,
  };
}
