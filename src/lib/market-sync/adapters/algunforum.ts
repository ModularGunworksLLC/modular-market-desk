/**
 * ALGunForum firearms classified board → local_ask observations.
 */

import "server-only";

import { parseIdentityFromTitle, parsePriceFromText } from "@/lib/market-sync/parse-title";
import type { StreetObservationInput } from "@/lib/market-sync/upsert-obs";

const BOARDS = [
  "https://www.algunforum.com/forums/handguns.60/",
  "https://www.algunforum.com/forums/rifles.61/",
  "https://www.algunforum.com/forums/shotguns.62/",
];

export async function ingestAlGunForum(): Promise<{
  observations: StreetObservationInput[];
  note: string;
}> {
  const observations: StreetObservationInput[] = [];
  const seen = new Set<string>();

  for (const board of BOARDS) {
    let html: string;
    try {
      const res = await fetch(board, {
        headers: {
          Accept: "text/html",
          "User-Agent": "ModularMarketDesk/1.0 (+local market comps; weekly sync)",
        },
        signal: AbortSignal.timeout(45_000),
      });
      if (!res.ok) continue;
      html = await res.text();
    } catch {
      continue;
    }

    const threadRe =
      /href="(https?:\/\/www\.algunforum\.com\/threads\/[^"]+)"[^>]*>([^<]{6,200})</gi;
    let m: RegExpExecArray | null;
    while ((m = threadRe.exec(html)) != null) {
      const url = m[1]!;
      const title = m[2]!.replace(/\s+/g, " ").trim();
      if (/rules|sticky|announcement/i.test(title)) continue;
      const price = parsePriceFromText(title);
      if (price == null) continue;
      const id = parseIdentityFromTitle(title);
      if (!id) continue;
      const dedupe = `${url}|${price}`;
      if (seen.has(dedupe)) continue;
      seen.add(dedupe);
      observations.push({
        identity: { manufacturer: id.manufacturer, model: id.model, category: "firearm" },
        price,
        title,
        url,
        source: "algunforum",
        kind: "local_ask",
        geo: "AL",
        provider: "algunforum",
        query: board,
      });
    }
    await new Promise((r) => setTimeout(r, 1000));
  }

  return {
    observations,
    note: `ALGunForum: ${observations.length} local asks`,
  };
}
