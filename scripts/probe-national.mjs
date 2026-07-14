const BASE =
  "https://bids.nationalauctionusa.com/auctions/46223-montana-sporting-auction-spring-2026";

const t = await (
  await fetch(`${BASE}?pageSize=300`, {
    headers: { "User-Agent": "Mozilla/5.0" },
  })
).text();

console.log("len", t.length);
console.log("lot cards", (t.match(/data-lotnumber/gi) || []).length);

for (const needle of [
  "buyer",
  "premium",
  "Buyer",
  "Premium",
  "credit card",
  "18.5",
  "15%",
]) {
  const i = t.toLowerCase().indexOf(needle.toLowerCase());
  if (i >= 0) console.log(needle, ":", t.slice(Math.max(0, i - 80), i + 200).replace(/\s+/g, " "));
}

const k = t.indexOf('data-lotnumber="');
console.log("\nfirst lot block:\n", t.slice(k, k + 1500));
