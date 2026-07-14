const url =
  "https://bids.auctionbypearce.com/auctions/46969-guns-gear-and-ammo-summer-auction?page=1&pageSize=100";
const t = await (await fetch(url)).text();
const cardRe =
  /data-lotnumber="(\d+)"[\s\S]*?alt="([^"]+)"[\s\S]*?(?:current-bid|high-bid|bidAmount)[^$]*\$([\d,]+\.\d{2})/gi;
let m;
let n = 0;
while ((m = cardRe.exec(t)) !== null && n < 3) {
  console.log(m[1], m[2], m[3]);
  n++;
}
// broader bid search near lotnumber
const lot1 = t.indexOf('data-lotnumber="1"');
console.log("\nlot1 block:");
console.log(t.slice(lot1, lot1 + 2500));
// find bid patterns
const bids = [...t.matchAll(/\$([\d,]+\.\d{2})/g)].slice(0, 10).map((x) => x[1]);
console.log("\nfirst $ amounts", bids);
