const DESK = "https://desk.modulargunworks.com";
const API = "https://www.pistolandpawn.com/api/products";

function r2(x) {
  return Math.round((x + Number.EPSILON) * 100) / 100;
}
function allIn(price, ship = 15) {
  return r2(price + ship);
}
function fvf(G) {
  const c = Math.min(G, 15000);
  return r2(0.06 * Math.min(c, 400) + 0.04 * Math.max(0, c - 400));
}
function profitGb(buy, G, ship = 30) {
  const ai = allIn(buy);
  const net = r2(G - fvf(G) - 5 - ship - 0.03 * (G + ship) - 3);
  return r2(net - ai);
}
function profitLocal(buy, G) {
  return r2(G / 1.09 - allIn(buy));
}

function parseGun(desc, mfr) {
  const t = `${mfr ?? ""} ${desc}`.replace(/\s+/g, " ").trim();
  if (!/pistol|rifle|shotgun|revolver|carbine|handgun|9mm|22|45|40|556|308|gauge|wmr|acp/i.test(t))
    return null;
  if (/ammo|magazine|optic|scope|mount|holster|cleaning|case only|upper|lower|receiver|barrel|grip|stock|kit|parts/i.test(t))
    return null;

  const mfrMap = [
    ["Smith & Wesson", /smith\s*&?\s*wesson/i],
    ["Ruger", /\bruger\b/i],
    ["Glock", /\bglock\b/i],
    ["Sig Sauer", /sig\s*sauer/i],
    ["Taurus", /\btaurus\b/i],
    ["Canik", /\bcanik\b/i],
    ["Beretta", /\bberetta\b/i],
    ["CZ", /\bcz[\s-]/i],
    ["Kimber", /\bkimber\b/i],
    ["Springfield", /\bspringfield\b/i],
    ["Mossberg", /\bmossberg\b/i],
    ["Remington", /\bremington\b/i],
    ["Henry", /\bhenry\b/i],
    ["Savage", /\bsavage\b/i],
    ["Winchester", /\bwinchester\b/i],
    ["Heritage", /\bheritage\b/i],
    ["Kel Tec", /kel[\s-]?tec/i],
    ["Hi-Point", /hi[\s-]?point/i],
    ["Rock Island Armory", /rock island/i],
    ["Stoeger", /\bstoeger\b/i],
    ["Walther", /\bwalther\b/i],
    ["FN", /\bFN\b/],
    ["HK", /\bHK\b/],
    ["Colt", /\bcolt\b/i],
    ["Browning", /\bbrowning\b/i],
    ["Diamondback", /diamondback/i],
    ["PSA", /palmetto|psa\b/i],
    ["Anderson", /anderson/i],
  ];

  let manufacturer = mfr ?? "";
  for (const [name, re] of mfrMap) {
    if (re.test(t)) {
      manufacturer = name;
      break;
    }
  }
  if (!manufacturer) return null;

  const calMatch = t.match(
    /\b(9mm|9x19|\.40\s*S&?W|40\s*S&?W|45\s*ACP|\.45\s*ACP|22\s*LR|\.22\s*LR|357|38\s*SPL|10mm|5\.56|\.223|308|30-06|12\s*Gauge|20\s*Gauge)\b/i,
  );
  const caliber = calMatch ? calMatch[1].replace(/\s+/g, " ") : "";

  let model = desc
    .replace(new RegExp(manufacturer, "i"), "")
    .replace(/\b(pistol|rifle|shotgun|revolver)\b/gi, "")
    .trim();

  const category = /shotgun|gauge/i.test(t)
    ? "shotgun"
    : /rifle|carbine|5\.56|223|308|30-06|ar-?15/i.test(t)
      ? "rifle"
      : "handgun";
  const condition = /new|nib|unfired/i.test(t) ? "new" : "used";

  return { manufacturer, model, caliber, category, condition };
}

const raw = await fetch(API, {
  headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0" },
}).then((r) => r.json());

const products = raw.data ?? raw.products ?? raw;
console.error(`API products: ${products.length}`);

// Filter sale-tagged — inspect fields
const sample = products[0];
console.error("Sample keys:", Object.keys(sample ?? {}).join(", "));

const saleItems = products.filter((p) => {
  const tags = JSON.stringify(p).toLowerCase();
  return (
    tags.includes("sales-ads") ||
    tags.includes("sale") ||
    tags.includes("website only") ||
    p.on_sale ||
    p.sale_price ||
    p.website_only
  );
});
console.error(`Sale-tagged candidates: ${saleItems.length}`);

// If tag filter weak, use all firearms with price < 800
const pool =
  saleItems.length > 10
    ? saleItems
    : products.filter((p) => {
        const d = (p.description ?? p.name ?? "").toLowerCase();
        return /pistol|rifle|shotgun|revolver|carbine/.test(d);
      });

const firearms = [];
for (const p of pool) {
  const desc = p.description ?? p.name ?? "";
  const mfr = p.manufacturer_name ?? p.manufacturer ?? "";
  const price = Number(p.sale_price ?? p.price ?? p.retail_price ?? p.unit_price ?? 0);
  if (!price || price > 800) continue;
  const gun = parseGun(desc, mfr);
  if (!gun) continue;
  firearms.push({
    id: p.product_id ?? p.id,
    desc,
    mfr,
    price,
    link: p.link_name ? `https://www.pistolandpawn.com/product/${p.link_name}` : null,
    ...gun,
  });
}
console.error(`Firearms to eval: ${firearms.length}`);

const results = [];
for (let i = 0; i < firearms.length; i++) {
  const f = firearms[i];
  try {
    const res = await fetch(`${DESK}/api/evaluate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        manufacturer: f.manufacturer,
        model: f.model,
        caliber: f.caliber,
        category: f.category,
        condition: f.condition,
        targetAcquisitionCost: f.price,
        inboundShip: 15,
        buyerPremiumPct: 0,
        autoComps: true,
        targetProfit: 50,
        outboundShip: 30,
        listingUpgrades: 3,
      }),
      signal: AbortSignal.timeout(120_000),
    });
    const j = await res.json();
    const sold = j.result?.sold ?? {};
    const score = j.catalogMatch?.score ?? 0;
    const p25 = sold.p25 ?? 0;
    const med = sold.median ?? 0;
    const n = sold.count ?? 0;
    if (n < 5 || score < 85) {
      results.push({ ...f, skip: true, gba: j.sourceStatus?.gba, score, n });
      continue;
    }
    const p25L = profitLocal(f.price, p25);
    const p25G = profitGb(f.price, p25);
    const medL = profitLocal(f.price, med);
    const medG = profitGb(f.price, med);
    results.push({
      ...f,
      soldN: n,
      score,
      p25,
      median: med,
      p25Local: p25L,
      p25Gb: p25G,
      medLocal: medL,
      medGb: medG,
      go: p25L >= 50 || p25G >= 50,
      gba: j.sourceStatus?.gba,
      listGb: med,
      listLocal: med,
    });
  } catch (e) {
    results.push({ ...f, error: e.message });
  }
  if ((i + 1) % 5 === 0) console.error(`  ${i + 1}/${firearms.length}`);
  await new Promise((r) => setTimeout(r, 350));
}

const go = results.filter((r) => r.go).sort((a, b) => b.medLocal - a.medLocal);
console.log(
  JSON.stringify(
    {
      evaluated: firearms.length,
      goCount: go.length,
      top: go.slice(0, 20),
      skipped: results.filter((r) => r.skip).slice(0, 10),
    },
    null,
    2,
  ),
);
