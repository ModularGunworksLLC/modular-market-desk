/** Extract dollar amounts from search snippets / titles. */

// Prefer comma-grouped or full digit runs so $1299.00 is not truncated to $129.
const PRICE_RE =
  /\$\s*((?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?)/g;

const MIN_FIREARM_PRICE = 50;
const MAX_FIREARM_PRICE = 15_000;

export function extractPricesFromText(text: string): number[] {
  if (!text) return [];
  const out: number[] = [];
  const re = new RegExp(PRICE_RE.source, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const raw = (m[1] ?? "").replace(/,/g, "");
    const n = Number(raw);
    if (!Number.isFinite(n)) continue;
    if (n < MIN_FIREARM_PRICE || n > MAX_FIREARM_PRICE) continue;
    out.push(n);
  }
  return out;
}

export function domainFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return "";
  }
}
