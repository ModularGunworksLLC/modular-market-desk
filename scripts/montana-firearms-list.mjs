/**
 * Export complete firearms from Montana Sporting Auction 46223.
 * Usage: node scripts/montana-firearms-list.mjs
 */
import { readFileSync, writeFileSync } from "fs";

const lots = JSON.parse(readFileSync("scripts/montana-lots.json", "utf8"));

// Accessories / parts / non-guns — not complete firearms
const excludeRe =
  /\b(upper receiver|upper assembly|complete upper|barrel only|parts kit|ammo|ammunition|rounds|grain|primers|\/box|powder|brass|dies|reload|reloading|handbook|guide to gun parts|safari|kayak|atv|boat|camper|truck|trailer|sword|knife|archery|foam rack|storage rack|gunlok|plano|protective rifle case|medieval|damascus|cleaver|pocket knife|fantasy|commemorative knife|horse bit|artwork|print|poster|photo|pigeon thrower|hand trap|lubewax|tackle box|arrowhead|airsoft|trail camera|golf ball|letter box|loading tray|case lube|shotgun shells|bulk lot of used|winchester pmb|morgan silver|peace silver|pet travel kennel|cooler|duty gear|badge holder|gun lock|clutch belt|mag pouch|base pads|targets|scope covers|pro mag 69|357 sigg\/40 smith & wesson with 40|double tap \.45 acp da6250)\b/i;

// Complete firearm signals
const includeRe =
  /\b(bolt action rifle|bolt action|semi-auto pistol|semi-automatic pistol|revolver|ar-15 rifle|spec15|patriot ar|panther arms|a-15 rifle|big boy|schuetzen target rifle|evoke rifle|american rifle|x-bolt|ab3 bolt|b-14 ridge|model 110|model 111|model 70|715t|70p|10\/22|mark ii|lc9|g2c|g3c|millennium|pt111|pt24|th10|1911-22|the judge|judge revolver|c39v2|c308|cetme|m & p-15|m&p-15|db-15|db15|am-15|omni hybrid|sub 200|rdb-c|str-9|xd-40|xd mod|vr80|tar 12|tbp12|835 ulti|500a|500c|5500|a303|835|4595|1095|4095|995|jcp|jhp|hi point|hi-point|christensen|browning|bergara|ruger|mossberg|taurus|chiappa|century arms|henry|smith & wesson|smith &wesson|springfield|anderson|dpms|diamond back|american tatical|american tactical|kel-?tec|stoeger|tikka|savage|marlin|black rain|winchester \.|winchester model|steven|j\.c\. higgins|beretta|panzer|tokarev 12|ria 12|aia 12|vanguard in 6\.5)\b/i;

function isFirearm(l) {
  const t = l.title;
  if (excludeRe.test(t)) return false;
  return includeRe.test(t);
}

const firearms = lots
  .filter(isFirearm)
  .sort((a, b) => Number(a.lot) - Number(b.lot));

const lines = firearms.map(
  (l) =>
    `Lot ${l.lot}\t$${l.bid.toFixed(2)}\t${l.bids} bids\t${l.title}`
);

writeFileSync("scripts/montana-firearms.txt", lines.join("\n"));
writeFileSync(
  "scripts/montana-firearms.json",
  JSON.stringify(firearms, null, 2)
);

console.log(`Firearms: ${firearms.length} / ${lots.length} total lots\n`);
for (const l of firearms) {
  console.log(
    `Lot ${String(l.lot).padStart(4)} | $${String(l.bid.toFixed(2)).padStart(8)} | ${String(l.bids).padStart(3)}b | ${l.title}`
  );
}
