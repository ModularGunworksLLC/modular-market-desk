const BASE =
  "https://bids.auctionbypearce.com/auctions/46969-guns-gear--ammo-summer-auction";
const PEARCE = 1.19025;
const keys = ["135", "308", "344", "346", "347", "509", "119", "513"];

let html = "";
for (let page = 1; page <= 8; page++) {
  html += await (
    await fetch(`${BASE}?page=${page}&pageSize=100`, {
      headers: { "User-Agent": "Mozilla/5.0" },
    })
  ).text();
}

for (const lot of keys) {
  const re = new RegExp(`data-lotnumber="${lot}"[\\s\\S]*?(?=data-lotnumber="|$)`);
  const c = html.match(re);
  if (!c) {
    console.log(`Lot ${lot}: NOT FOUND`);
    continue;
  }
  const chunk = c[0];
  const title = (chunk.match(/class="title">([^<]+)/) ?? [])[1]?.trim();
  const bid = parseFloat(
    ((chunk.match(/winning-bid-amount">\$([\d,]+\.\d{2})/) ?? [])[1] ?? "0").replace(
      /,/g,
      ""
    )
  );
  const bids = parseInt((chunk.match(/<strong>Bids:<\/strong><span>(\d+)/) ?? [])[1] ?? "0", 10);
  const closed = /bidding complete|lot closed|sold/i.test(chunk);
  console.log(
    `Lot ${lot} ${closed ? "CLOSED" : "OPEN"} | $${bid} (${bids}b) all-in $${(bid * PEARCE).toFixed(2)} | ${title}`
  );
}
