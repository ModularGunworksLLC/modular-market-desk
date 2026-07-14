const urls = [
  "https://www.pistolandpawn.com/sale-ads",
  "https://www.pistolandpawn.com/product-tag/sales-ads",
  "https://www.pistolandpawn.com/product-listings?product_category_code=HANDGUNS",
];

for (const url of urls) {
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  const html = await res.text();
  console.log("\n===", url, "len", html.length);

  // product rows in listings table
  const rowRe = /<tr[^>]*>[\s\S]*?<\/tr>/gi;
  const rows = html.match(rowRe) ?? [];
  const products = [];
  for (const row of rows) {
    const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) =>
      m[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(),
    );
    if (cells.length >= 2 && cells[0] && !/title|manufacturer/i.test(cells[0])) {
      products.push(cells);
    }
  }
  console.log("table rows:", products.length);
  for (const p of products.slice(0, 8)) console.log(" ", p.join(" | "));

  // woocommerce product cards
  const cardRe = /class="woocommerce-LoopProduct-link[^"]*"[^>]*href="([^"]+)"[\s\S]*?class="woocommerce-loop-product__title"[^>]*>([^<]+)/gi;
  let m;
  let cards = 0;
  while ((m = cardRe.exec(html))) {
    cards++;
    if (cards <= 5) {
      const priceM = html.slice(m.index, m.index + 500).match(/woocommerce-Price-amount[^>]*>[\s\S]*?\$([\d,.]+)/);
      console.log(" card:", m[2].trim(), priceM?.[1] ?? "?");
    }
  }
  console.log("woo cards:", cards);

  // embedded JSON
  const jsonLd = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi);
  console.log("json-ld blocks:", jsonLd?.length ?? 0);

  // look for product_id or price patterns
  const priceHits = html.match(/\$[\d,]+\.\d{2}/g) ?? [];
  console.log("price strings:", priceHits.length, priceHits.slice(0, 10).join(", "));
}
