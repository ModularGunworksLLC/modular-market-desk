/**
 * Strict auction-lot kind classifier — keep ammo/mags/gear out of the firearm
 * pricing pipeline. Brand names alone (Winchester, Remington, Springfield) must
 * NOT override clear ammo/accessory signals.
 */

export type LotKind = "firearm" | "ammo" | "accessory" | "knife" | "other";

/** Clear ammunition / powder / shotshell signals. */
const AMMO_RE =
  /\b(?:ammo|ammunition|cartridges?|\brounds?\b|box(?:es)?\s+of|qty[:\s#]*\d{2,}|(?:\d{2,4}\s*)?gr(?:ain)?s?\b|hollow\s*points?|\bhps?\b|\bfmj\b|full\s*metal\s*jacket|\bjhp\b|buckshot|birdshot|lead\s*shot|game\s*loads?|target\s*loads?|rifled\s*slugs?|smokeless\s*powder|gun\s*powder|\bpowder\b.{0,20}\blbs?\b|golden\s*bullet|dynapoint|super\s*x.{0,40}(?:loads?|shot|slug)|express\s+(?:buckshot|long\s*range)|nitro\s*turkey|rimfire\s+hollow|plated\s+hollow|metal\s+case\s+bullet|value\s+pack.{0,20}(?:brass|hollow|rounds?))\b/i;

/** Magazines, optics-only, parts — not a complete firearm. */
const ACCESSORY_RE =
  /\b(?:magazines?|\bmag\s*pack|\bmag\s*only|extended\s*mags?|drum\s*mags?|\d+\s*rd\s+mags?\b|holsters?(?:\s+only)?|scope\s*only|optic\s*only|optics?\s+only|red\s*dots?|reflex\s+sight|bipod|sling\s*only|grip\s*modules?|parts?\s*kits?|barrel\s*only|receiver(?:s)?\s*only|stripped\s+receiver|upper\s*only|lower\s*only|slide\s*only|chassis\s*only|cleaning\s*kits?|speed\s*loaders?)\b/i;

const KNIFE_RE = /\b(?:knives|knife|blade|machete|bayonet)\b/i;

const NON_GUN_GEAR_RE =
  /\b(?:binocular|spotting\s*scope|tent|camping|apparel|t-?shirt|hat\b|memorabilia|advertising|shipping\s+information|auction\s+information|reloading\s+press|dies?\s+set)\b/i;

/** Positive complete-firearm cues (not brand-only). */
const FIREARM_TYPE_RE =
  /\b(?:pistol|revolver|rifle|shotgun|carbine|handgun|firearm|\bguns?\b|bolt-?action|lever-?action|pump-?action|semi-?auto(?:matic)?|single-?shot|over[\s-]?under|side[\s-]?by[\s-]?side|AR-?15|AK-?47|AKM|1911|SKS|gatling|S\/N|Serial(?:\s*#| number)?)\b/i;

/** Brands that appear on both guns and ammo — never alone enough to classify as firearm. */
const BRAND_HINT_RE =
  /\b(?:glock|sig(?:\s*sauer)?|ruger|smith|wesson|s&w|colt|remington|winchester|mossberg|benelli|beretta|canik|taurus|kel-?tec|springfield|marlin|henry|savage|browning|dpms|fn|hk|heckler|walther|kimber|daniel\s*defense|palmetto|psa|aero|anderson|radical|tikka|howa|bergara|weatherby|cz|tisas|rock\s*island|heritage|charter|hi-?point|norinco|intrac|benelli|franchi)\b/i;

export function classifyLotTitle(
  title: string,
  opts?: { category?: string },
): LotKind {
  const t = title.trim();
  if (!t) return "other";

  // Magazines / optics-only before ammo grain/rd heuristics (e.g. "15rd Magazines").
  if (ACCESSORY_RE.test(t)) return "accessory";

  // Ammo / powder always wins over brand hints (Winchester/Remington ammo boxes).
  if (AMMO_RE.test(t)) return "ammo";

  if (KNIFE_RE.test(t) && !FIREARM_TYPE_RE.test(t)) return "knife";

  if (NON_GUN_GEAR_RE.test(t) && !FIREARM_TYPE_RE.test(t)) return "other";

  if (FIREARM_TYPE_RE.test(t)) return "firearm";

  if (/\b(?:SN|S\/N|Serial)\b/i.test(t)) return "firearm";

  if (BRAND_HINT_RE.test(t)) return "firearm";

  // Batch often strips "Rifle/Pistol" into category — honor that so Henry Golden Boy etc. still price.
  const cat = (opts?.category ?? "").trim().toLowerCase();
  if (cat === "rifle" || cat === "handgun" || cat === "pistol" || cat === "shotgun" || cat === "firearm") {
    return "firearm";
  }

  return "other";
}

/** True when the lot should enter the firearm Max Bid / OA pipeline. */
export function isFirearmPricingLot(title: string, opts?: { category?: string }): boolean {
  return classifyLotTitle(title, opts) === "firearm";
}

export function lotKindLabel(kind: LotKind): string {
  switch (kind) {
    case "ammo":
      return "ammunition";
    case "accessory":
      return "magazine/accessory";
    case "knife":
      return "knife";
    case "firearm":
      return "firearm";
    default:
      return "non-firearm";
  }
}
