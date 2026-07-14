const BASE = "https://www.pistolandpawn.com";

async function tryUrl(path) {
  try {
    const res = await fetch(BASE + path, {
      headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json,text/html" },
      signal: AbortSignal.timeout(30000),
    });
    const ct = res.headers.get("content-type") ?? "";
    const text = await res.text();
    return { path, status: res.status, ct, len: text.length, preview: text.slice(0, 500) };
  } catch (e) {
    return { path, error: e.message };
  }
}

const paths = [
  "/wp-json/wc/v3/products?per_page=20",
  "/wp-json/wc/store/v1/products?per_page=20",
  "/wp-json/wp/v2/product?per_page=20",
  "/api/products",
  "/product-listings?product_category_code=HANDGUNS&format=json",
  "/product-listings?product_category_code=HANDGUNS",
  "/sale-ads",
  "/current-sale/",
];

for (const p of paths) {
  console.log(JSON.stringify(await tryUrl(p)));
}
