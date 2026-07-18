/**
 * Best-effort make/model parse from classified titles for street-ask ingest.
 */

const MAKES = [
  "Smith & Wesson",
  "Smith and Wesson",
  "S&W",
  "Sig Sauer",
  "SIG",
  "Ruger",
  "Glock",
  "Colt",
  "Remington",
  "Winchester",
  "Marlin",
  "Henry",
  "Mossberg",
  "Kel-Tec",
  "Keltec",
  "Taurus",
  "Springfield",
  "Beretta",
  "CZ",
  "Heckler & Koch",
  "HK",
  "FN",
  "Canik",
  "Tisas",
  "Palmetto",
  "PSA",
  "Daniel Defense",
  "Aero",
  "Anderson",
  "Bushmaster",
  "Savage",
  "Tikka",
  "Howa",
  "Bergara",
  "Browning",
  "Benelli",
  "Stoeger",
  "Kimber",
  "Walther",
  "Hi-Point",
  "Heritage",
  "Charter",
  "Rock Island",
  "CCI",
  "Federal",
] as const;

export function parseIdentityFromTitle(title: string): {
  manufacturer: string;
  model: string;
} | null {
  const t = title.replace(/\s+/g, " ").trim();
  if (!t) return null;
  const lower = t.toLowerCase();
  let best: { manufacturer: string; at: number; len: number } | null = null;
  for (const make of MAKES) {
    const at = lower.indexOf(make.toLowerCase());
    if (at < 0) continue;
    if (!best || at < best.at || (at === best.at && make.length > best.len)) {
      best = { manufacturer: make === "S&W" ? "Smith & Wesson" : make === "SIG" ? "Sig Sauer" : make === "Keltec" ? "Kel-Tec" : make, at, len: make.length };
    }
  }
  if (!best) return null;
  const after = t.slice(best.at + best.len).replace(/^[\s\-:,]+/, "").trim();
  const model = after.split(/\s+[\$\d]| - | — |\|/)[0]?.trim() || after.slice(0, 48).trim();
  if (!model || model.length < 2) return null;
  return { manufacturer: best.manufacturer, model: model.slice(0, 64) };
}

export function parsePriceFromText(text: string): number | null {
  const m = text.match(/\$\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{2})?|[0-9]+(?:\.[0-9]{2})?)/);
  if (!m?.[1]) return null;
  const n = Number(m[1].replace(/,/g, ""));
  if (!Number.isFinite(n) || n < 50 || n > 15_000) return null;
  return n;
}
