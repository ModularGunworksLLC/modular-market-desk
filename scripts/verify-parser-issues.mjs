import { parseTitleBlob } from "../src/lib/batch/parse.ts";

const cases = [
  ["H1-trail", "Remington Sportsman 74 .30-06 Springfield Rifle", "Remington", /Sportsman/, ".30-06"],
  ["H1-trail", "Remington 742 Woodsmaster .30-06 Springfield Rifle", "Remington", /742|Woodsmaster/, ".30-06"],
  ["H1-trail", "Ruger American Predator .308 Winchester Rifle", "Ruger", /American|Predator/, ".308"],
  ["H2-import", "Stoeger Llama 9mm Para Pistol", "Llama", /Para|9/, "9mm"],
  ["H2-import", "Churchill Akkar Model 612 12-Gauge Shotgun", "Akkar", /612/, "12ga"],
  ["H2-ria", "RIA M1911 A1-FS 10mm Pistol", "Rock Island Armory", /M1911/, "10mm"],
  ["H2-tisas", "Tisas ZIG M1911 45ACP Pistol", "Tisas", /ZIG|M1911/, ".45 ACP"],
  ["H3-typo", "Springfield Armoty XD-9 9mm Pistol", "Springfield", /XD/, "9mm"],
  ["H3-dash", "Ruger LC - 5.7x28", "Ruger", /LC/, "5.7x28"],
  ["H3-dash", "Ruger LC Carbine 5.7x28 Semi-Auto Rifle", "Ruger", /LC/, "5.7x28"],
  ["H5-empty", "Stoeger Llama 38 SPL Revolver", "Llama", /\.38|Special/, ".38 Special"],
  ["H5-empty", "Rossi 38 SPL Revolver", "Rossi", /\.38|Special/, ".38 Special"],
];

let fail = 0;
for (const [hyp, title, wantMfr, wantModel, wantCal] of cases) {
  const p = parseTitleBlob(title);
  const okMfr = p.manufacturer.toLowerCase() === wantMfr.toLowerCase();
  const okModel = wantModel.test(p.model);
  const okCal = !wantCal || p.caliber.toLowerCase() === wantCal.toLowerCase();
  if (!okMfr || !okModel || !okCal) fail++;
  console.log(
    JSON.stringify({
      hyp,
      ok: okMfr && okModel && okCal,
      title,
      got: { mfr: p.manufacturer, model: p.model, cal: p.caliber, cat: p.category },
      wantMfr,
      wantCal,
    }),
  );
}
console.log(fail === 0 ? "ALL_PASS" : `FAILS_${fail}`);
process.exit(fail === 0 ? 0 : 1);
