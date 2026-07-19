/** Pure TGV HTML parsers — no I/O. */

export type TgvCategory = "handgun" | "rifle" | "shotgun";

export type TgvSoldRow = {
  price: number;
  condition: string;
  manufacturer: string;
  model: string;
  caliber: string;
  salesDateText: string;
  salesDateAttr: string;
  location: string;
  upc: string;
  sku: string;
  externalItemId: string;
  title: string;
};

export type TgvPageParse = {
  manufacturer: string;
  model: string;
  category: TgvCategory;
  privatePartyUsed: number | null;
  privatePartyNew: number | null;
  tradeInUsed: number | null;
  tradeInNew: number | null;
  soldCount: number;
  usedSoldCount: number | null;
  newSoldCount: number | null;
  avg12mUsed: number | null;
  avg12mNew: number | null;
  solds: TgvSoldRow[];
};

function money(raw: string | undefined | null): number | null {
  if (!raw) return null;
  const n = Number(String(raw).replace(/[$,\s]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ");
}

function stripTags(s: string): string {
  return decodeEntities(s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
}

export function inferTgvCategory(pathOrText: string): TgvCategory {
  const t = pathOrText.toLowerCase();
  if (t.includes("/rifle") || /\brifle\b/.test(t)) return "rifle";
  if (t.includes("/shotgun") || /\bshotgun\b/.test(t)) return "shotgun";
  return "handgun";
}

/** Parse Estimated Value table + narrative averages + sold sample tables. */
export function parseTgvModelHtml(html: string, opts?: { path?: string; maxSolds?: number }): TgvPageParse {
  const maxSolds = opts?.maxSolds ?? 40;
  const path = opts?.path ?? "";
  const category = inferTgvCategory(path || html);

  const h1 = (html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ?? "").replace(/<[^>]+>/g, " ");
  const h1Clean = stripTags(h1);
  // "SIG SAUER P320 pistol PRICE..."
  let manufacturer = "";
  let model = "";
  const h1Match = h1Clean.match(/^(.+?)\s+(pistol|rifle|shotgun)\s+PRICE/i);
  if (h1Match) {
    const name = h1Match[1]!.trim();
    // naive split: first two tokens often brand for SIG SAUER; keep rest as model
    const parts = name.split(/\s+/);
    if (parts.length >= 2) {
      manufacturer = `${parts[0]} ${parts[1]}`.replace(/\bSAUER\b/i, "SAUER");
      // Better: known multi-word brands handled in resolve; here take last token as model if 2 tokens
      if (parts.length === 2) {
        manufacturer = parts[0]!;
        model = parts[1]!;
      } else {
        // SIG SAUER P320 / SMITH & WESSON M&P...
        manufacturer = parts.slice(0, 2).join(" ");
        model = parts.slice(2).join(" ");
      }
    } else {
      manufacturer = name;
    }
  }

  // Private Party / Trade In table (Used | New columns)
  let privatePartyUsed: number | null = null;
  let privatePartyNew: number | null = null;
  let tradeInUsed: number | null = null;
  let tradeInNew: number | null = null;

  const ppRow = html.match(/Private\s*Party[\s\S]{0,400}?\$([0-9,.]+)[\s\S]{0,120}?\$([0-9,.]+)/i);
  if (ppRow) {
    privatePartyUsed = money(ppRow[1]);
    privatePartyNew = money(ppRow[2]);
  }
  const tiRow = html.match(/Trade\s*In[\s\S]{0,400}?\$([0-9,.]+)[\s\S]{0,120}?\$([0-9,.]+)/i);
  if (tiRow) {
    tradeInUsed = money(tiRow[1]);
    tradeInNew = money(tiRow[2]);
  }

  // Narrative: "average price of $X new and $Y used" + 12 month
  const narr = html.match(
    /average price of\s*\$([0-9,.]+)\s*new\s*and\s*\$([0-9,.]+)\s*used/i,
  );
  if (narr) {
    privatePartyNew = privatePartyNew ?? money(narr[1]);
    privatePartyUsed = privatePartyUsed ?? money(narr[2]);
  }
  const m12 = html.match(
    /12 month average price is\s*\$([0-9,.]+)\s*new\s*and\s*\$([0-9,.]+)\s*used/i,
  );
  const avg12mNew = m12 ? money(m12[1]) : null;
  const avg12mUsed = m12 ? money(m12[2]) : null;

  const soldCount = Number((html.match(/Sold\s*\[(\d+)\]/i) ?? [])[1] ?? 0) || 0;
  const usedSoldCount = Number((html.match(/Used\s*Sold\s*\[(\d+)\]/i) ?? [])[1] ?? NaN);
  const newSoldCount = Number((html.match(/New\s*Sold\s*\[(\d+)\]/i) ?? [])[1] ?? NaN);

  const solds: TgvSoldRow[] = [];
  const tableRe = /<table[^>]*class="table"[^>]*>([\s\S]*?)<\/table>/gi;
  let tm: RegExpExecArray | null;
  while ((tm = tableRe.exec(html)) && solds.length < maxSolds) {
    const body = tm[1] ?? "";
    if (!/PRICE:/i.test(body)) continue;
    if (/Private\s*Party/i.test(body)) continue;

    const plain = stripTags(body);
    const price = money((plain.match(/PRICE:\s*\$?([0-9,.]+)/i) ?? [])[1] ?? null);
    if (price == null || !(price > 0)) continue;

    const datetime = (body.match(/datetime="([^"]+)"/i) ?? [])[1] ?? "";
    const itemId =
      (body.match(/value-p-(\d+)/i) ?? [])[1] ??
      (html.slice(Math.max(0, tm.index - 400), tm.index).match(/value-p-(\d+)/i) ?? [])[1] ??
      "";

    const labeled = (label: string): string => {
      const re = new RegExp(
        `${label}:\\s*([^]*?)(?=(?:PRICE|MANUFACTURER|CONDITION|MODEL|SOLD|UPC|LOCATION|SKU|CALIBER|MANF\\.?\\s*PART|CAPACITY|BARREL)\\s*:|$)`,
        "i",
      );
      const m = plain.match(re);
      return (m?.[1] ?? "").replace(/\s+/g, " ").trim();
    };

    solds.push({
      price,
      condition: labeled("CONDITION"),
      manufacturer: labeled("MANUFACTURER"),
      model: labeled("MODEL"),
      caliber: labeled("CALIBER"),
      salesDateText: labeled("SOLD"),
      salesDateAttr: datetime,
      location: labeled("LOCATION"),
      upc: labeled("UPC"),
      sku: labeled("SKU"),
      externalItemId: itemId,
      title: "",
    });
  }

  return {
    manufacturer,
    model,
    category,
    privatePartyUsed,
    privatePartyNew,
    tradeInUsed,
    tradeInNew,
    soldCount,
    usedSoldCount: Number.isFinite(usedSoldCount) ? usedSoldCount : null,
    newSoldCount: Number.isFinite(newSoldCount) ? newSoldCount : null,
    avg12mUsed,
    avg12mNew,
    solds,
  };
}

export function isCloudflareChallengeHtml(html: string): boolean {
  return /Attention Required!\s*\|\s*Cloudflare/i.test(html) || /cf-browser-verification/i.test(html);
}

export function isTgvNotFoundHtml(html: string, status?: number): boolean {
  if (status === 404) return true;
  return /page not found|404/i.test(html) && !/Private Party/i.test(html);
}
