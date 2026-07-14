const url =
  "https://bids.nationalauctionusa.com/auctions/46223-montana-sporting-auction-spring-2026";
const t = await (await fetch(url)).text();

// JSON blobs often hold auction metadata
for (const pat of [
  /buyersPremium[^,\}]{0,120}/gi,
  /buyerPremium[^,\}]{0,120}/gi,
  /premiumPercent[^,\}]{0,80}/gi,
  /"premium"[^,\}]{0,80}/gi,
  /creditCard[^,\}]{0,80}/gi,
  /46223[^]{0,500}/,
]) {
  const m = t.match(pat);
  if (m) console.log(m[0].slice(0, 200));
}

const termsLink = [...t.matchAll(/href="([^"]*46223[^"]*terms[^"]*)"/gi)].map((x) => x[1]);
console.log("terms links", termsLink.slice(0, 5));

// end date
const endM = t.match(/Ends on[\s\S]{0,200}/i);
console.log("ends", endM?.[0]?.replace(/\s+/g, " "));
