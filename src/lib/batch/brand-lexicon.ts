/**
 * Maker normalization applied to a title BEFORE model tokens are cut.
 *
 * One table. Add a row to teach the desk a house spelling. `strip` phrases are
 * brand suffixes and import noise ("Repeating Arms", "Arms Factory", "Russia")
 * and must not remain in the model string.
 *
 * OA maker names checked against the 2026-11-19 phase-1 cache notes:
 *   - HENRY (BIG BOY .44 MAG and the rest of the Henry tree)
 *   - SMITH & WESSON (the desk already scores this as Smith & Wesson; norm() drops "&")
 *   - IZHMASH SAIGA-12 (66 sold) and SAIGA SAIGA 12 (39 sold) — both makers exist
 *   - Cugir is the maker the sheet should store. ROMARM is only an extra OA try
 *     because "Romarm/Cugir" is how the import line is written, not a guessed model.
 *
 * H012X stays the model. The scorer, not this table, may also try HENRY BIG BOY
 * .44 MAG — Henry's own page lists model number H012X as the Big Boy X .44 Mag.
 */

export interface BrandLexiconEntry {
  id: string;
  /** Removed from the title (the alias). Longer phrases belong in `pattern` first. */
  pattern: RegExp;
  manufacturer: string;
  oaMakers: string[];
  /** Suffixes and country tokens dropped after the alias is removed. */
  strip: RegExp[];
  /**
   * When true, the matched text is the model (Saiga-12) and is left in the title.
   * The maker is still forced.
   */
  keepMatchInTitle?: boolean;
  note: string;
}

export const BRAND_LEXICON: readonly BrandLexiconEntry[] = [
  {
    id: "henry-repeating-arms",
    pattern: /\bhenry\s+repeating\s+arms\b/i,
    manufacturer: "Henry",
    oaMakers: ["Henry", "HENRY"],
    strip: [/\brepeating\s+arms\b/gi],
    note: "OA maker is HENRY. 'Repeating Arms' is a suffix, not a model.",
  },
  {
    id: "smith-wesson",
    pattern: /\b(?:smith\s*(?:&|and)\s*wesson|s\s*&\s*w)\b/i,
    manufacturer: "Smith & Wesson",
    oaMakers: ["Smith & Wesson", "SMITH & WESSON"],
    strip: [],
    note: "S&W, S & W, Smith and Wesson, and Smith & Wesson are one OA maker.",
  },
  {
    id: "izhmash",
    pattern: /\b(?:izhmash|izmash|kalashnikov)\b/i,
    manufacturer: "Izhmash",
    oaMakers: ["IZHMASH", "SAIGA"],
    strip: [/\brussia\b/gi, /\bu\.?s\.?s\.?r\.?\b/gi, /\bromarm\b/gi],
    note: "Izmash is the misspelling. OA leaves are IZHMASH and SAIGA. Country words after a slash are not the model.",
  },
  {
    id: "saiga",
    pattern: /\bsaiga(?:\s*-?\s*\d+)?\b/i,
    manufacturer: "Izhmash",
    oaMakers: ["IZHMASH", "SAIGA"],
    strip: [/\brussia\b/gi],
    keepMatchInTitle: true,
    note: "Saiga-12 is the model. Maker stays Izhmash so the scorer can try IZHMASH and SAIGA.",
  },
  {
    id: "cugir",
    pattern: /\b(?:romarm\s*\/\s*cugir|cugir\s+arms\s+factory|cugir)\b/i,
    manufacturer: "Cugir",
    oaMakers: ["Cugir", "CUGIR", "ROMARM"],
    strip: [/\barms\s+factory\b/gi, /\bromarm\b/gi],
    note: "Cugir Arms Factory and Romarm/Cugir both store maker Cugir. The factory suffix is not the model.",
  },
] as const;

/**
 * Scorer-only rewrites. The parsed model is unchanged.
 * H012X is verified: henryusa.com model H012X and the 2023 Henry MSRP list
 * both name it Big Boy X Model .44 Mag/.44 Spl. Other H012* SKUs are not listed.
 */
export const OA_MODEL_ALIASES: readonly {
  id: string;
  pattern: RegExp;
  manufacturer: string;
  model: string;
  caliber?: string;
  note: string;
}[] = [
  {
    id: "henry-h012x",
    pattern: /\bh012x\b/i,
    manufacturer: "Henry",
    model: "Big Boy",
    caliber: ".44 Magnum",
    note: "Verified H012X = Big Boy X .44 Mag. Parser keeps H012X; this is only an OA attempt.",
  },
];

export interface BrandRewrite {
  text: string;
  manufacturer: string | null;
  oaMakers: string[];
}

/** Normalize makers before any model-token split. */
export function rewriteBrandLexicon(title: string): BrandRewrite {
  let text = title;
  let manufacturer: string | null = null;
  const oaMakers: string[] = [];
  let touched = false;

  for (const entry of BRAND_LEXICON) {
    if (!entry.pattern.test(text)) continue;
    touched = true;
    manufacturer = manufacturer ?? entry.manufacturer;
    if (!entry.keepMatchInTitle) text = text.replace(entry.pattern, " ");
    for (const strip of entry.strip) text = text.replace(strip, " ");
    for (const maker of entry.oaMakers) {
      if (!oaMakers.some((m) => m.toLowerCase() === maker.toLowerCase())) oaMakers.push(maker);
    }
  }

  if (touched) {
    text = text.replace(/\s+\/\s+/g, " ");
  }
  text = text.replace(/\s{2,}/g, " ").trim();
  if (manufacturer && !text.toLowerCase().startsWith(manufacturer.toLowerCase())) {
    text = `${manufacturer} ${text}`.replace(/\s{2,}/g, " ").trim();
  }
  return { text, manufacturer, oaMakers };
}

export function oaMakersForIdentity(manufacturer: string, model: string): string[] {
  const hit = rewriteBrandLexicon(`${manufacturer} ${model}`);
  const out: string[] = [];
  const push = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (!out.some((m) => m.toLowerCase() === trimmed.toLowerCase())) out.push(trimmed);
  };
  push(manufacturer);
  for (const maker of hit.oaMakers) push(maker);
  return out;
}

export function oaModelAliasFor(manufacturer: string, model: string): {
  manufacturer: string;
  model: string;
  caliber?: string;
} | null {
  const blob = `${manufacturer} ${model}`;
  for (const alias of OA_MODEL_ALIASES) {
    if (!alias.pattern.test(blob)) continue;
    return { manufacturer: alias.manufacturer, model: alias.model, caliber: alias.caliber };
  }
  return null;
}
