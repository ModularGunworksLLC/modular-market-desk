#!/usr/bin/env python3
"""Point Shop by Brand tiles at working /shop/?pa_brand=slug URLs."""

from pathlib import Path

THEME = Path("/opt/bitnami/wordpress/wp-content/themes/modulargunworks")

helper = THEME / "inc" / "brand-logos.php"
ht = helper.read_text(encoding="utf-8")

# Remove broken partial if we added earlier in a failed attempt — ensure clean helper exists
marker = "function modulargunworks_get_brand_archive_url"
block = '''

/**
 * Public URL for a brand product listing.
 *
 * WooCommerce core "product_brand" already owns /brand/, so pa_brand term links 404.
 * Route through the shop archive with the attribute query instead.
 *
 * @param WP_Term $term Brand term (pa_brand).
 * @return string
 */
function modulargunworks_get_brand_archive_url( $term ) {
	if ( ! ( $term instanceof WP_Term ) ) {
		return '';
	}
	$shop = function_exists( 'wc_get_page_permalink' ) ? wc_get_page_permalink( 'shop' ) : home_url( '/shop/' );
	if ( ! is_string( $shop ) || $shop === '' ) {
		$shop = home_url( '/shop/' );
	}
	return add_query_arg( 'pa_brand', $term->slug, $shop );
}
'''

if marker in ht:
    # Strip from first occurrence of old rewrite/archive helpers to EOF extras if duplicated — safer: replace function body via regex
    import re
    ht2, n = re.subn(
        r"\n/\*\*[\s\S]*?function modulargunworks_pa_brand_taxonomy_args[\s\S]*?add_filter\(\s*'woocommerce_taxonomy_args_pa_brand'[\s\S]*?\);\n",
        "\n",
        ht,
        count=1,
    )
    if n:
        ht = ht2
        print("removed pa_brand rewrite filter")
    ht2, n = re.subn(
        r"\n/\*\*[\s\S]*?function modulargunworks_get_brand_archive_url\s*\([\s\S]*?\n\}\n",
        "\n",
        ht,
        count=1,
    )
    if n:
        ht = ht2
        print("removed old archive url helper")

ht = ht.rstrip() + "\n" + block
helper.write_text(ht, encoding="utf-8")
print("brand-logos.php: shop archive URLs")

page = THEME / "page-brands.php"
pt = page.read_text(encoding="utf-8")
old = """		$brand_url = get_term_link( $term );
		if ( is_wp_error( $brand_url ) ) {
			continue;
		}
"""
new = """		$brand_url = function_exists( 'modulargunworks_get_brand_archive_url' )
			? modulargunworks_get_brand_archive_url( $term )
			: get_term_link( $term );
		if ( ! $brand_url || is_wp_error( $brand_url ) ) {
			continue;
		}
"""
# maybe already patched
if "modulargunworks_get_brand_archive_url" in pt and "get_term_link( $term )" not in pt.split("brands-grid")[1].split("foreach")[1][:400]:
    print("page-brands.php: already using helper?")
else:
    if old in pt:
        page.write_text(pt.replace(old, new, 1), encoding="utf-8")
        print("page-brands.php: links updated")
    elif "modulargunworks_get_brand_archive_url" in pt:
        print("page-brands.php: helper already referenced")
    else:
        raise SystemExit("could not patch page-brands links")
