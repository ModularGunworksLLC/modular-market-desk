import { classifyLotTitle } from "@/lib/auctions/lot-kind";
import type { AuctionPlatform } from "@/lib/auctions/detect";
import type { AuctionIngestResult, AuctionLot } from "@/lib/auctions/types";

export function toAuctionKind(title: string): AuctionLot["kind"] {
  const kind = classifyLotTitle(title);
  return kind === "accessory" ? "other" : kind;
}

export function decodeHtmlEntities(raw: string): string {
  return raw
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, " ")
    .trim();
}

/** Strip house-export junk (Pearce leading ": ") so title parse sees the brand first. */
export function cleanLotTitle(raw: string): string {
  return decodeHtmlEntities(raw).replace(/^[:|.\-–—\s]+/, "").trim();
}

export function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, " ");
}

export function parseMoney(raw: string | undefined | null): number | null {
  if (raw == null) return null;
  const n = Number.parseFloat(String(raw).replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export function isPlaceholderLot(lot: string): boolean {
  return ["0", "00", "000"].includes(lot);
}

export function readJsonString(slice: string, key: string): string | null {
  const re = new RegExp(`"${key}"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"`);
  const m = slice.match(re);
  if (!m?.[1]) return null;
  try {
    return JSON.parse(`"${m[1]}"`) as string;
  } catch {
    return m[1].replace(/\\"/g, '"');
  }
}

export function readJsonNumber(slice: string, key: string): number | null {
  const re = new RegExp(`"${key}"\\s*:\\s*(-?[0-9]+(?:\\.[0-9]+)?)`);
  const m = slice.match(re);
  if (!m?.[1]) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

export function buildIngestResult(args: {
  auctionUrl: string;
  host: string;
  platform: AuctionPlatform;
  lots: AuctionLot[];
  warnings?: string[];
  pagesFetched?: number;
  stoppedReason?: AuctionIngestResult["stoppedReason"];
}): AuctionIngestResult {
  const firearmLots = args.lots.filter((l) => l.kind === "firearm");
  return {
    auctionUrl: args.auctionUrl,
    host: args.host,
    platform: args.platform,
    lots: args.lots,
    firearmLots,
    skipped: args.lots.length - firearmLots.length,
    warnings: args.warnings ?? [],
    hasListingIncrements: args.lots.some(
      (l) =>
        (l.requiredBid != null && l.requiredBid > 0) ||
        (l.bidIncrementAmount != null && l.bidIncrementAmount > 0),
    ),
    loadedLots: args.lots.length,
    pagesFetched: args.pagesFetched ?? 1,
    stoppedReason: args.stoppedReason ?? "complete",
  };
}
