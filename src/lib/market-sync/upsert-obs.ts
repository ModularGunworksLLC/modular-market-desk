/**
 * UPSERT street-ask observations into the local market data bank.
 */

import "server-only";

import { randomUUID } from "node:crypto";

import { db } from "@/lib/db";
import { webPriceObservations, type PriceObsGeo, type PriceObsKind } from "@/lib/db/schema";
import { webCanonicalKey } from "@/lib/web-comps/aggregate";
import { domainFromUrl } from "@/lib/web-comps/extract";
import { recomputeStats } from "@/lib/web-comps/ingest";
import type { WebIdentity } from "@/lib/web-comps/types";

export type StreetObservationInput = {
  identity: WebIdentity;
  price: number;
  title: string;
  url: string;
  source: string;
  kind: PriceObsKind;
  geo: PriceObsGeo;
  provider?: string;
  query?: string;
};

export async function upsertStreetObservations(
  rows: StreetObservationInput[],
): Promise<{ insertedOrTouched: number; keys: string[] }> {
  const keys = new Set<string>();
  let n = 0;
  for (const row of rows) {
    if (!(row.price > 0) || !row.url.trim()) continue;
    const key = webCanonicalKey(row.identity);
    keys.add(key);
    const domain = domainFromUrl(row.url);
    await db
      .insert(webPriceObservations)
      .values({
        id: randomUUID(),
        canonicalKey: key,
        manufacturer: row.identity.manufacturer,
        model: row.identity.model,
        caliber: row.identity.caliber ?? "",
        variant: row.identity.variant ?? "",
        upc: row.identity.upc || null,
        mpn: row.identity.mpn || null,
        price: row.price,
        listingTitle: row.title.slice(0, 400),
        sourceUrl: row.url,
        sourceDomain: domain,
        query: row.query ?? "",
        provider: row.provider ?? row.source,
        source: row.source,
        kind: row.kind,
        geo: row.geo,
        observedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [
          webPriceObservations.canonicalKey,
          webPriceObservations.sourceUrl,
          webPriceObservations.price,
        ],
        set: {
          listingTitle: row.title.slice(0, 400),
          source: row.source,
          kind: row.kind,
          geo: row.geo,
          provider: row.provider ?? row.source,
          observedAt: new Date(),
        },
      });
    n += 1;
  }

  for (const key of keys) {
    const sample = rows.find((r) => webCanonicalKey(r.identity) === key);
    if (!sample) continue;
    await recomputeStats(key, {
      manufacturer: sample.identity.manufacturer,
      model: sample.identity.model,
      caliber: sample.identity.caliber ?? "",
    });
  }

  return { insertedOrTouched: n, keys: [...keys] };
}
