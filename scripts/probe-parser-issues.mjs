import { parseTitleBlob } from "../src/lib/batch/parse.ts";

const cases = [
  "Springfield Remington Sportsman 74 .30-06",
  "Springfield Remington 742 Woodsmaster .30-06",
  "Winchester Ruger American Predator .308",
  "Stoeger Llama 9mm Para Pistol",
  "Stoeger Llama 38 SPL Revolver",
  "Churchill Akkar Model 612 12-Gauge Shotgun",
  "RIA M1911 A1-FS 10mm Pistol",
  "Tisas ZIG M1911 45ACP Pistol",
  "Tisas Arms Zig M1911 Pistol",
  "Springfield Armoty XD-9 9mm Pistol",
  "Ruger LC - 5.7x28",
  "Ruger LC Carbine 5.7x28",
];

for (const t of cases) {
  const p = parseTitleBlob(t);
  console.log(JSON.stringify({ t, ...p }));
}
