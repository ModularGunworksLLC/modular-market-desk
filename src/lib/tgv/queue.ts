/**
 * Build OA-gap queue for TGV drip: zero-sold OA models + vendor firearms missing from OA.
 * Strict complete-firearm filter — no optics / parts / ammo / accessories.
 */

import { db } from "@/lib/db";
import { inferMarketCategory } from "@/lib/markets/category";

import type { TgvCategory } from "./parse";
import {
  canonicalizeTgvManufacturer,
  normalizeBrandModelKey,
  preferModelVariant,
  preferTgvCategory,
  tgvModelPath,
} from "./resolve-url";

export type TgvGapItem = {
  manufacturer: string;
  model: string;
  category: TgvCategory;
  gapReason: "oa_zero_sold" | "oa_missing";
  tgvPath: string;
};

/** Brands that should never enter the TGV firearm drip. */
const ACCESSORY_BRANDS =
  /\b(leupold|burris|trijicon|holosun|vortex|primary\s*arms|aimpoint|eotech|nightforce|swarovski|zeiss|meopta|bushnell|nikon|simmons|redfield|truglo|meprolight|night\s*fision|xs\s*sight|viridian|crimson\s*trace|streamlight|surefire|modlite|cloud\s*defensive|unity\s*tactical|magpul|promag|hexmag|maglula|ets|mbx|warne|weaver|talon|american\s*defense|scalarworks|geissele|radian|strike\s*industries|phase\s*5|fortis|bcm\s*(grip|stock|qg)|hornadys?|federal(\s*cartridge)?|cci|speer|winchester\s*(ammunition|powder|bulk)|pmc|fiocchi|nosler|sierra|barnes|berger|rcbs|lyman|lee\s*precision|forster|redding|dillon|hornady\s*reloading|silencerco|dead\s*air|huxwrx|rugged\s*suppressor|otter\s*creek|sb\s*tactical|timney|hogue|blackhawk|safariland|galco|alien\s*gear|vedder|tier\s*1|crossbreed|desantis|bianchi|uncle\s*mike|hoppe'?s|otis|birchwood|kleen\s*bore|break[\s-]?free|out[e]?rs|plano|mtm|allen\s*company|walkers?|peltor|howard\s*leight|3m\s*peltor|mechanix|condor|5\.11|tru[\s-]?spec|vertx|readywise|tannerite|caldwell|champion\s*target|action\s*target|do[\s-]?all|birchwood\s*casey)\b/i;

/** Model tokens that mean parts/optics/accessories — always exclude. */
const PARTS_OR_ACCESSORY_MODEL =
  /\b(romeo|juliet|red\s*dot|reflex|holographic|magnifier|optic|optics|scope|sight|laser|light|flashlight|illuminator|holster|magazine|mag\b|drum|clip\b|adapter|muzzle|brake|compensator|flash\s*hider|suppressor|silencer|stock\b|grip\b|trigger|bipod|monopod|sling|mount|rail\b|handguard|forend|forearm|barrel|barreled|receiver|stripped|jig|tool|cleaner|solvent|oil|lube|case\b|bag\b|pouch|ear\b|muff|target|decoy|knife|clothing|boot|camo|apparel|charger|battery|cable|warranty|sticker|patch|ammo|ammunition|cartridge|primer|powder|brass|bullet|bullets|projectile|reloading|die\b|shell\s*holder|charger|buffer|castle\s*nut|end\s*plate|takedown|pin\b|spring\b|detent|safety\b|hammer\b|sear\b|bolt\s*carrier|bcg|gas\s*block|gas\s*tube|charging\s*handle|choke|tube\b|bead\s*sight|iron\s*sight|front\s*sight|rear\s*sight|rings?\b|bases?\b|conversion\s*kit|echo\b)\b/i;

const FIREARM_CUE =
  /\b(pistol|handgun|revolver|rifle|carbine|shotgun|firearm|pistol\s*caliber|\bpcc\b|1911|ar-?15|ar-?10|ak-?47|ak-?74|bolt\s*action|lever\s*action|pump\s*action|semi-?auto|over.?under|side\s*by\s*side|single\s*shot|derringer|long\s*gun)\b/i;

const DIST_FIREARM_CATEGORY =
  /\b(hand\s*guns?|handguns?|pistols?|revolvers?|rifles?|shotguns?|long\s*guns?|firearms?|guns?\b|carbines?)\b/i;

const KNOWN_GUN_MAKERS =
  /\b(glock|smith\s*&?\s*wesson|s\s*&\s*w|ruger|sig\s*sauer|springfield|savage|mossberg|remington|winchester|browning|beretta|benelli|stoeger|cz([\s-]?usa)?|walther|hk|heckler|colt|kimber|fn|fnh|iwi|kel-?tec|canik|taurus|heritage|charter|henry|marlin|howa|tikka|sako|bergara|weatherby|christensen|daniel\s*defense|palmetto|psa|anderson|bear\s*creek|aero\s*precision|staccato|shadow\s*systems|nighthawk|wilson\s*combat|les\s*baer|ed\s*brown|chiappa|tristar|retay|zastava|century|tisas|sds|girsan|rock\s*island|auto[\s-]?ordnance|thompson|north\s*american|naa|cva|traditions|uberti|cimarron|taylor'?s|rossi|franchi|hatsan|escort|pointer|wise\s*arms|just\s*right|fmk|polymer\s*80|volquartsen|magnum\s*research|desert\s*eagle|bond\s*arms|american\s*tactical|\bati\b|radical|kalashnikov|arsenal|century\s*arms|dpms|bushmaster|armalite|windham|spike'?s|noveske|lmt|lwrc|pof|barrett|fn\s*america|stoeger|cz|sar\s*usa|canik|tisas|dw\s*dan\s*wesson|dan\s*wesson|sarsilmaz|canik|hi[\s-]?point|sccy|kahr|bersa|eaa|girsan|mac|interarms|norinco|ska|izhmash|baikal|toledo|charles\s*daly|savage\s*arms|mossberg|remington|winchester\s*repeating)\b/i;

function toTgvCategory(raw: string): TgvCategory {
  const c = raw.toLowerCase();
  if (c === "rifle") return "rifle";
  if (c === "shotgun") return "shotgun";
  return "handgun";
}

function cleanModel(m: string): string {
  return preferModelVariant(m.replace(/\s+/g, " ").trim());
}

function identityForTgv(manufacturer: string, model: string, extra?: string): {
  manufacturer: string;
  model: string;
  category: TgvCategory;
} {
  const mfr = canonicalizeTgvManufacturer(preferFirearmManufacturer(manufacturer));
  const mod = cleanModel(model);
  const inferred = toTgvCategory(inferMarketCategory(mod, extra ?? "", mfr));
  return {
    manufacturer: mfr,
    model: mod,
    category: preferTgvCategory(mfr, mod, inferred),
  };
}

/** Prefer the firearms brand when distributors pipe importers (e.g. Beretta|Tikka). */
export function preferFirearmManufacturer(raw: string): string {
  const parts = raw
    .split("|")
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length <= 1) return raw.trim();
  const known = parts.filter((p) => KNOWN_GUN_MAKERS.test(p));
  if (known.length) return known[known.length - 1]!;
  return parts[parts.length - 1]!;
}

/** True only when this looks like a complete firearm worth a TGV model page. */
export function isCompleteFirearmForTgvQueue(
  manufacturer: string,
  model: string,
  extra?: string | null,
): boolean {
  const mfr = preferFirearmManufacturer(manufacturer);
  const mod = cleanModel(model);
  if (!mfr || !mod) return false;
  if (mod.length < 2) return false;

  const extraText = (extra ?? "").trim();
  const blob = `${mfr} ${mod} ${extraText}`.toLowerCase();

  // Hard denies first
  if (ACCESSORY_BRANDS.test(mfr)) return false;
  if (PARTS_OR_ACCESSORY_MODEL.test(mod)) return false;
  if (PARTS_OR_ACCESSORY_MODEL.test(mfr)) return false;

  // Ammo / accessory brand phrases in combined blob (e.g. "Winchester Ammunition")
  if (ACCESSORY_BRANDS.test(blob) && !KNOWN_GUN_MAKERS.test(mfr)) return false;

  const knownMaker = KNOWN_GUN_MAKERS.test(mfr);
  const firearmCue = FIREARM_CUE.test(mod) || FIREARM_CUE.test(extraText);
  const distCat = DIST_FIREARM_CATEGORY.test(extraText);

  // Known OEMs: allow unless model already failed parts filter
  if (knownMaker) return true;

  // Unknown OEM: require explicit firearm category or model cue — never bare SKUs
  if (firearmCue || distCat) return true;

  return false;
}

/** Distinct OA manufacturer+model with zero solds across all calibers/conditions. */
async function zeroSoldOaModels(): Promise<TgvGapItem[]> {
  const res = await db.$client.execute(`
    SELECT manufacturer, model,
      MAX(CASE WHEN sold_count > 0 THEN 1 ELSE 0 END) AS any_sold
    FROM oa_market_stats
    GROUP BY upper(trim(manufacturer)), upper(trim(model))
    HAVING any_sold = 0
    ORDER BY manufacturer, model
  `);

  const out: TgvGapItem[] = [];
  for (const row of res.rows) {
    const id = identityForTgv(String(row.manufacturer ?? ""), String(row.model ?? ""));
    if (!isCompleteFirearmForTgvQueue(id.manufacturer, id.model)) continue;
    out.push({
      manufacturer: id.manufacturer,
      model: id.model,
      category: id.category,
      gapReason: "oa_zero_sold",
      tgvPath: tgvModelPath(id.manufacturer, id.model, id.category),
    });
  }
  return out;
}

/** Vendor catalog firearm rows whose make+model is not in oa_catalog. */
async function vendorMissingFromOa(limit: number): Promise<TgvGapItem[]> {
  const oa = await db.$client.execute(`
    SELECT DISTINCT upper(trim(manufacturer)) AS m, upper(trim(model)) AS model
    FROM oa_catalog
    WHERE trim(model) != ''
  `);
  const oaKeys = new Set(
    oa.rows.map((r) => normalizeBrandModelKey(String(r.m ?? ""), String(r.model ?? ""))),
  );

  const vend = await db.$client.execute(`
    SELECT manufacturer, model, category, description, count(*) AS n
    FROM catalog_items
    WHERE manufacturer IS NOT NULL AND trim(manufacturer) != ''
      AND model IS NOT NULL AND trim(model) != ''
    GROUP BY upper(trim(manufacturer)), upper(trim(model))
    ORDER BY n DESC
    LIMIT ${Math.max(limit * 5, 1000)}
  `);

  const out: TgvGapItem[] = [];
  const seen = new Set<string>();
  for (const row of vend.rows) {
    if (out.length >= limit) break;
    const extra = `${row.category ?? ""} ${row.description ?? ""}`;
    const id = identityForTgv(String(row.manufacturer ?? ""), String(row.model ?? ""), extra);
    if (!isCompleteFirearmForTgvQueue(id.manufacturer, id.model, extra)) continue;

    const key = normalizeBrandModelKey(id.manufacturer, id.model);
    if (oaKeys.has(key) || seen.has(key)) continue;

    let softHit = false;
    const mfrTok = id.manufacturer.toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim().split(/\s+/)[0] ?? "";
    const modelTok = id.model.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
    if (mfrTok.length >= 4 && modelTok.length >= 3) {
      for (const ok of oaKeys) {
        if (ok.includes(mfrTok) && ok.includes(modelTok)) {
          softHit = true;
          break;
        }
      }
    }
    if (softHit) continue;

    seen.add(key);
    out.push({
      manufacturer: id.manufacturer,
      model: id.model,
      category: id.category,
      gapReason: "oa_missing",
      tgvPath: tgvModelPath(id.manufacturer, id.model, id.category),
    });
  }
  return out;
}

export async function buildOaGapQueue(opts?: {
  maxZeroSold?: number;
  maxVendorMissing?: number;
}): Promise<TgvGapItem[]> {
  const maxZero = opts?.maxZeroSold ?? 5000;
  // Keep vendor seed modest — prefer quality over flooding TGV with weak matches
  const maxVendor = opts?.maxVendorMissing ?? 800;

  const zero = await zeroSoldOaModels();
  const missing = await vendorMissingFromOa(maxVendor);

  const seen = new Set<string>();
  const out: TgvGapItem[] = [];
  // Zero-sold OA first (real catalog gaps), then vendor missing
  for (const item of [...zero.slice(0, maxZero), ...missing]) {
    const key = `${item.category}|${normalizeBrandModelKey(item.manufacturer, item.model)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}
