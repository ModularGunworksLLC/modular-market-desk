const AUCTION =
  "https://bids.auctionbypearce.com/auctions/46969-guns-gear-and-ammo-summer-auction";
const lotsWanted = new Set([
  "5", "19", "74", "95", "97", "135", "150", "151", "172",
]);

function decode(s) {
  return String(s ?? "")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

const map = new Map();
for (let page = 1; page <= 6; page++) {
  const html = await (await fetch(`${AUCTION}?page=${page}&pageSize=100`)).text();
  const cardRe = /data-lotnumber="(\d+)"[\s\S]*?<\/div><\/div><\/div>/g;
  let m;
  while ((m = cardRe.exec(html))) {
    const lot = m[1];
    if (!lotsWanted.has(lot)) continue;
    const chunk = m[0];
    const titleM = chunk.match(/class="title">([^<]+)/);
    const bidM = chunk.match(/class="winning-bid-amount">\$([\d,]+\.\d{2})/);
    if (titleM && bidM) {
      map.set(lot, {
        lot,
        title: decode(titleM[1]),
        bid: parseFloat(bidM[1].replace(/,/g, "")),
      });
    }
  }
}

for (const id of [...lotsWanted].sort((a, b) => Number(a) - Number(b))) {
  console.log(JSON.stringify(map.get(id) ?? { lot: id, missing: true }));
}
