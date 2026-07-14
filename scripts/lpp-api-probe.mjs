const paths = [
  "/api/products",
  "/api/products?page=1&per_page=100",
  "/api/products?tag=sales-ads",
  "/api/products?product_tag=sales-ads",
  "/api/products/search?tag=sales-ads",
  "/api/product-listings?product_category_code=HANDGUNS",
];

for (const p of paths) {
  try {
    const res = await fetch("https://www.pistolandpawn.com" + p, {
      headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0" },
    });
    const text = await res.text();
    let parsed = null;
    try {
      parsed = JSON.parse(text);
    } catch {}
    const keys = parsed ? Object.keys(parsed) : [];
    const count = parsed?.data?.length ?? parsed?.products?.length ?? (Array.isArray(parsed) ? parsed.length : null);
    console.log(p, res.status, text.length, "keys:", keys.join(","), "count:", count);
    if (parsed?.data?.[0]) {
      console.log("  sample:", JSON.stringify(parsed.data[0], null, 2).slice(0, 800));
    }
  } catch (e) {
    console.log(p, "ERR", e.message);
  }
}
