const DESK = "https://desk.modulargunworks.com";

const PRODUCTS = [
  { title: "ATI Stripped Lower Receiver AR-15 Kit", price: 99 },
  { title: "Three (3) Pack of ATI ATIGLOWMS Stripped Lower Rec...", price: 120 },
  { title: 'Heritage Rough Rider 22 LR 6RD 6.50" RR22CH6', price: 124 },
  { title: 'Ruger 2015 Wrangler 22 LR 6 Shot 3.75" Black Cerak...', price: 149 },
  { title: '*FACTORY BLEMISH* RUGER SUPER WRANGLER 22LR/WMR 5"...', price: 169 },
  { title: 'RUGER WRANGLER 3.75" SILVER BIRDSHEAD 22LR 02016', price: 190 },
  { title: 'RUGER WRANGLER 3.75" BURNT BRONZE BIRDSHEAD 22LR ...', price: 190 },
  { title: 'Ruger 3701 LCP 380 ACP DA 2.75" 6+1 Black Polymer ...', price: 209 },
  { title: "TAURUS GX2 9MM BLK/BLK 3.3\" 13+1", price: 255 },
  { title: 'G3C 9MM BK/BK 3.2" 12+1 2 MAGS', price: 257 },
  { title: 'Ruger MAX-9 9mm 3.2" MS Blk 12+1', price: 264 },
  { title: "Rossi Brawler Single Shot Pistol - BLK | .410 Ga. ...", price: 268 },
  { title: "Taurus 1G2C93912 G2C 9mm Luger 3.20\" 12+1 Black S...", price: 270 },
  { title: 'TAURUS GX4 9MM BLK 3" 10RD', price: 275 },
  { title: "TAU GX4 TORO 9MM PST 11/13TNGS", price: 275 },
  { title: "Maverick Arms 31023 88 Security Blued 12 Gauge 18....", price: 279 },
  { title: "RUGER LCP MAX 380ACP FRONT NIGHT SIGHT TWO-TONE", price: 288 },
  { title: "*FACTORY BLEMISH* Taurus 856 *CA Compliant 38 Spec...", price: 299 },
  { title: 'RUGER 10/22 SPORTER "CHRIS KILLOY EDITION" 22LR SS...', price: 299 },
  { title: 'Ruger 10/22 22LR 18.5" MLOK Blk 10-rd W/ Larry\'s E...', price: 299 },
  { title: 'USED GLOCK 22 GEN4 40S&W 4.5" 15rd(2)', price: 299 },
  { title: "RUGER SECURITY 380ACP LITE RACK 3.4 BLK 15RD 03839", price: 309 },
  { title: "* FACTORY BLEMISH* RUGER SUPER WRANGLER MIDNIGHT 2...", price: 310 },
  { title: "Henry H001 Classic Lever Action 22 Short,Long,LR ...", price: 333 },
  { title: "SDS 1911 GOVT MODEL 45ACP 5\" PARKERIZED", price: 339 },
  { title: 'Ruger 40107 Mark IV 22/45 22 LR 5.50" 10+1 Blued B...', price: 349 },
  { title: 'Taurus 1191101COM 1911 Commander 45 ACP 4.20" 8+1 ...', price: 375 },
  { title: "GLENFIELD 52003 MODEL A 270 20 MOSSGRNSPLT", price: 379 },
  { title: "GLENFIELD 52002 MODEL A 30-06 20\" MOSSGRNSPLT", price: 379 },
  { title: "Chiappa Firearms 920383 LA322 Standard Takedown 22...", price: 380 },
  { title: 'GLENFIELD 52001 MODEL A 308 20" MOSSGRNSPLT', price: 397 },
  { title: 'GLENFIELD 52005 MODEL A 6.5 CREEDMOOR 20" MOSSGRNS...', price: 397 },
  { title: 'Ruger 16401 Ruger-57 5.7x28mm 4.94" 20+1 Black Bl...', price: 399 },
  { title: "Ruger RXM 9mm BLK/GRAY 15+1 4\" AS", price: 399 },
  { title: "RUGER 13776 LCP MAX 380ACP W/ Viridian Green Dot ...", price: 399 },
  { title: 'RUGER RXM 9MM BLK/BLK 15+1 4" AS', price: 399 },
  { title: 'Taurus 11911019MM 1911 9mm Luger 5" 9+1 Matte Bla...', price: 400 },
  { title: 'Ruger 5418 LCR 38 Special +P 5 Shot 1.87" Matte B...', price: 425 },
  { title: 'Smith & Wesson 11663 M&P Shield EZ 380 ACP 3.68" 8...', price: 439 },
  { title: "RUGER LCP MAX 380ACP FRONT NIGHT SIGHT TWO-TONE 13...", price: 459 },
  { title: "Smith & Wesson 12436 M&P Shield EZ M2.0 9mm Luger ...", price: 465 },
  { title: 'RADICAL 556 16" MLOK 30RD BLK', price: 475 },
  { title: "Rossi RM66 Revolver - Stainless | .357 Mag | 6\" Ba...", price: 485 },
  { title: "Rossi RM64 Revolver - Stainless | .357 Mag | 4\" Ba...", price: 485 },
  { title: "Glock PX4350201FRMOS G43X MOS Sub-Compact 9mm Luge...", price: 485 },
  { title: "Windham Weaponry RI16SLFTT Superlight SRC 223 Rem,...", price: 599 },
  { title: "SPG EC9409BPAC ECHLN CMP UDT 4 15/18", price: 719 },
  { title: 'Ruger 8515 AR-556 5.56x45mm NATO 16.10" 30+1 Blac...', price: 814 },
  { title: "*FACTORY BLEMISH* Ruger 5303B Super Redhawk Alaska...", price: 849 },
  { title: 'MARLIN 1894 CLASSIC 357 MAG 18.6" 9RD WALNUT 70410', price: 999 },
  { title: "Magnum Research DESERT EAGLE 6\" BLK MK XIX 44 MAG ...", price: 1565 },
  { title: "Magnum Research DE357 Desert Eagle Mark XIX 357 Ma...", price: 1565 },
  { title: "Magnum Research DE50 Desert Eagle Mark XIX 50 AE 6...", price: 1775 },
];

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

function parseGun(desc) {
  const t = desc.replace(/\s+/g, " ").trim();
  if (!/pistol|rifle|shotgun|revolver|carbine|handgun|9mm|22|45|40|556|308|gauge|wmr|acp|glock|taurus|ruger|smith|springfield|henry|marlin|mossberg|lever|desert eagle|1911|10\/22|wrangler|lcp|shield|g43|g22|g3c|gx2|gx4|rxm|mark iv|lcr|redhawk/i.test(t))
    return null;
  if (/stripped lower|lower receiver|lower rec|pack of ati|upper only|barrel only|grip only|stock only|parts kit/i.test(t))
    return null;

  const mfrMap = [
    ["Smith & Wesson", /smith\s*&?\s*wesson|m&p/i],
    ["Ruger", /\bruger\b/i],
    ["Glock", /\bglock\b/i],
    ["Sig Sauer", /sig\s*sauer|springfield armory ec|spg ec/i],
    ["Taurus", /\btaurus\b|g3c|gx2|gx4/i],
    ["Canik", /\bcanik\b/i],
    ["Beretta", /\bberetta\b/i],
    ["Kimber", /\bkimber\b/i],
    ["Springfield", /\bspringfield\b|spg ec/i],
    ["Mossberg", /\bmossberg\b|maverick arms/i],
    ["Henry", /\bhenry\b/i],
    ["Heritage", /\bheritage\b/i],
    ["Rossi", /\brossi\b/i],
    ["Chiappa", /chiappa/i],
    ["Marlin", /\bmarlin\b/i],
    ["Magnum Research", /magnum research|desert eagle/i],
    ["Windham Weaponry", /windham/i],
    ["Radical Firearms", /radical/i],
    ["SDS", /\bsds\b/i],
    ["Glenfield", /glenfield/i],
  ];

  let manufacturer = "";
  for (const [name, re] of mfrMap) {
    if (re.test(t)) {
      manufacturer = name;
      break;
    }
  }
  if (!manufacturer) return null;

  const calMatch = t.match(
    /\b(9mm|9x19|\.40\s*S&?W|40\s*S&?W|45\s*ACP|\.45\s*ACP|22\s*LR|\.22\s*LR|357|38\s*SPL|38\s*Special|10mm|5\.56|556|\.223|223|308|30-06|270|6\.5|12\s*Gauge|20\s*Gauge|5\.7|50\s*AE|44\s*MAG|410)\b/i,
  );
  const caliber = calMatch ? calMatch[1].replace(/\s+/g, " ") : "";

  let model = t
    .replace(/\*FACTORY BLEMISH\*/gi, "")
    .replace(/\* CA Compliant/gi, "")
    .replace(new RegExp(manufacturer, "i"), "")
    .trim();

  const category = /shotgun|gauge/i.test(t)
    ? "shotgun"
    : /rifle|carbine|5\.56|556|223|308|30-06|270|6\.5|10\/22|ar-?556|lever action|takedown|windham|radical|glenfield/i.test(t)
      ? "rifle"
      : "handgun";
  const condition = /used/i.test(t) ? "used" : "new";

  return { manufacturer, model, caliber, category, condition };
}

const firearms = PRODUCTS.map((p) => {
  const gun = parseGun(p.title);
  if (!gun) return null;
  return { ...p, ...gun };
}).filter(Boolean);

console.error(`Evaluating ${firearms.length} firearms...`);

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
    const sold = j.result?.sold ?? j.sold ?? {};
    const score = j.catalogMatch?.score ?? 0;
    const p25 = sold.p25 ?? 0;
    const med = sold.median ?? 0;
    const p75 = sold.p75 ?? 0;
    const n = sold.count ?? 0;
    const p25L = profitLocal(f.price, p25);
    const p25G = profitGb(f.price, p25);
    const medL = profitLocal(f.price, med);
    const medG = profitGb(f.price, med);
    const dealerFloor = j.wholesale?.cheaperThanTarget ?? false;
    results.push({
      title: f.title,
      price: f.price,
      manufacturer: f.manufacturer,
      model: f.model.slice(0, 60),
      caliber: f.caliber,
      soldN: n,
      score,
      p25,
      median: med,
      p75,
      p25Local: p25L,
      p25Gb: p25G,
      medLocal: medL,
      medGb: medG,
      goGb: p25G >= 50,
      goLocal: p25L >= 50,
      goMedGb: medG >= 50,
      dealerFloor,
      gba: j.sourceStatus?.gba ?? j.gba,
    });
  } catch (e) {
    results.push({ title: f.title, price: f.price, error: e.message });
  }
  if ((i + 1) % 5 === 0) console.error(`  ${i + 1}/${firearms.length}`);
  await new Promise((r) => setTimeout(r, 400));
}

const goGb = results.filter((r) => r.goGb).sort((a, b) => b.medGb - a.medGb);
const goLocal = results.filter((r) => r.goLocal).sort((a, b) => b.medLocal - a.medLocal);
const thin = results.filter((r) => !r.error && r.soldN >= 5 && (r.p25Gb >= 25 || r.p25Local >= 25) && !r.goGb && !r.goLocal);

console.log(
  JSON.stringify(
    {
      evaluated: firearms.length,
      goGbCount: goGb.length,
      goLocalCount: goLocal.length,
      goGb,
      goLocal,
      thin,
      noGo: results
        .filter((r) => !r.error && !r.goGb && !r.goLocal && r.soldN >= 5)
        .sort((a, b) => Math.max(b.p25Gb, b.p25Local) - Math.max(a.p25Gb, a.p25Local))
        .slice(0, 15),
      errors: results.filter((r) => r.error),
      lowComps: results.filter((r) => !r.error && r.soldN < 5),
    },
    null,
    2,
  ),
);
