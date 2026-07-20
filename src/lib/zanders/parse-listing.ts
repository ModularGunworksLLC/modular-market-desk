/** Pure Zanders Magento listing HTML parser — no I/O. */

export type ZandersListingProduct = {
  sku: string;
  upc: string;
  description: string;
  href: string | null;
  qty: number | null;
  dealerPrice: number | null;
  msrp: number | null;
  mapPrice: number | null;
  category: string;
};

function money(raw: string | undefined | null): number | null {
  if (!raw) return null;
  const n = Number(String(raw).replace(/,/g, ""));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** Toolbar: Items 1-60 of 2559 */
export function parseZandersItemCount(html: string): number | null {
  const m =
    html.match(/of\s*<span[^>]*class="toolbar-number"[^>]*>([\d,]+)<\/span>/i) ||
    html.match(/of\s*<span[^>]*>([\d,]+)<\/span>/i);
  if (!m?.[1]) return null;
  const n = Number(m[1].replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

export function parseZandersListingHtml(
  html: string,
  category: string,
): ZandersListingProduct[] {
  const names: Array<{ href: string; name: string }> = [];
  const linkRe = /product-item-link[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = linkRe.exec(html))) {
    names.push({
      href: m[1]!,
      name: m[2]!.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim(),
    });
  }

  const skus: string[] = [];
  const skuRe = /Item Number:\s*<\/span>\s*<span>([^<]+)<\/span>/gi;
  while ((m = skuRe.exec(html))) skus.push(m[1]!.trim());

  const upcs: string[] = [];
  const upcRe = /UPC:\s*<\/span>\s*<span>([^<]+)<\/span>/gi;
  while ((m = upcRe.exec(html))) upcs.push(m[1]!.trim());

  const avails: string[] = [];
  const availRe = /Available:<\/span>\s*<span[^>]*>([^<]*)<\/span>/gi;
  while ((m = availRe.exec(html))) avails.push(m[1]!.trim());

  const priceBlocks = [...html.matchAll(/price-box[\s\S]{0,500}?\$([0-9,.]+)/gi)].map(
    (x) => x[1]!,
  );
  const msrps = [...html.matchAll(/MSRP:\s*\$([0-9,.]+)/gi)].map((x) => x[1]!);
  const maps = [...html.matchAll(/MAP:\s*\$([0-9,.]+)/gi)].map((x) => x[1]!);

  const n = Math.min(names.length, skus.length);
  const out: ZandersListingProduct[] = [];
  for (let i = 0; i < n; i++) {
    const qtyRaw = avails[i];
    const qty =
      qtyRaw != null && qtyRaw !== ""
        ? Number(String(qtyRaw).replace(/[^0-9.-]/g, ""))
        : null;
    out.push({
      sku: skus[i] || "",
      upc: upcs[i] || "",
      description: names[i]!.name,
      href: names[i]!.href || null,
      qty: Number.isFinite(qty as number) ? (qty as number) : null,
      dealerPrice: money(priceBlocks[i]),
      msrp: money(msrps[i]),
      mapPrice: money(maps[i]),
      category,
    });
  }
  return out;
}
