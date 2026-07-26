#!/usr/bin/env python3
from pathlib import Path
import re

THEME = Path("/opt/bitnami/wordpress/wp-content/themes/modulargunworks")
helper = THEME / "inc" / "brand-logos.php"
ht = helper.read_text(encoding="utf-8")

if "modulargunworks_render_back_to_brands" in ht:
    print("back-to-brands already present")
else:
    ht = ht.rstrip() + """

/**
 * URL for the Shop by Brand page.
 *
 * @return string
 */
function modulargunworks_get_brands_page_url() {
	$page = get_page_by_path( 'brands' );
	if ( $page instanceof WP_Post ) {
		return get_permalink( $page );
	}
	return home_url( '/brands/' );
}

/**
 * Active pa_brand term from taxonomy archive or ?pa_brand= shop filter.
 *
 * @return WP_Term|null
 */
function modulargunworks_get_active_pa_brand_term() {
	if ( function_exists( 'is_tax' ) && is_tax( 'pa_brand' ) ) {
		$obj = get_queried_object();
		if ( $obj instanceof WP_Term ) {
			return $obj;
		}
	}
	$slug = isset( $_GET['pa_brand'] ) ? sanitize_title( wp_unslash( $_GET['pa_brand'] ) ) : ''; // phpcs:ignore WordPress.Security.NonceVerification.Recommended
	if ( $slug === '' ) {
		return null;
	}
	$term = get_term_by( 'slug', $slug, 'pa_brand' );
	return ( $term instanceof WP_Term ) ? $term : null;
}

/**
 * “All brands” link on brand-filtered shop views.
 *
 * @return void
 */
function modulargunworks_render_back_to_brands() {
	$term = modulargunworks_get_active_pa_brand_term();
	if ( ! $term ) {
		return;
	}
	$url = modulargunworks_get_brands_page_url();
	echo '<p class="mgw-back-to-brands"><a href="' . esc_url( $url ) . '">&larr; ' . esc_html__( 'All brands', 'modulargunworks' ) . '</a></p>';
}
add_action( 'woocommerce_shop_loop_header', 'modulargunworks_render_back_to_brands', 5 );

/**
 * Breadcrumb: Home → Shop by Brand → {Brand}.
 *
 * @param array $crumbs Breadcrumbs.
 * @return array
 */
function modulargunworks_brand_filter_breadcrumbs( $crumbs ) {
	$term = modulargunworks_get_active_pa_brand_term();
	if ( ! $term ) {
		return $crumbs;
	}
	$home = ! empty( $crumbs[0] ) ? $crumbs[0] : array( __( 'Home', 'modulargunworks' ), home_url( '/' ) );
	return array(
		$home,
		array( __( 'Shop by Brand', 'modulargunworks' ), modulargunworks_get_brands_page_url() ),
		array( $term->name, '' ),
	);
}
add_filter( 'woocommerce_get_breadcrumb', 'modulargunworks_brand_filter_breadcrumbs', 20 );
"""
    helper.write_text(ht, encoding="utf-8")
    print("brand-logos.php: back-to-brands added")

layout = THEME / "assets" / "css" / "layout.css"
css = layout.read_text(encoding="utf-8")
if ".mgw-back-to-brands" not in css:
    css = css.rstrip() + """

/* Back to brands from brand-filtered shop */
.mgw-back-to-brands {
  margin: 0 0 0.75rem;
  font-size: 0.95rem;
}
.mgw-back-to-brands a {
  color: var(--color-primary, #b22222);
  font-weight: 600;
  text-decoration: none;
}
.mgw-back-to-brands a:hover {
  text-decoration: underline;
}
.mgw-shop-archive-heading .mgw-back-to-brands {
  margin-top: 0.35rem;
}
"""
    layout.write_text(css, encoding="utf-8")
    print("layout.css: back-to-brands styles")
else:
    print("layout.css already styled")

fn = THEME / "functions.php"
fnt = fn.read_text(encoding="utf-8")
fnt2, n = re.subn(
    r"(mgw-layout.*?),\s*'1\.0\.\d+'\s*\);",
    r"\1, '1.0.16' );",
    fnt,
    count=1,
)
if n == 1:
    fn.write_text(fnt2, encoding="utf-8")
    print("layout css version 1.0.16")
else:
    print("warn: could not bump layout version")
