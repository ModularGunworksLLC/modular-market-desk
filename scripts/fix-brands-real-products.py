#!/usr/bin/env python3
"""Only list brands that have at least one published product; use shop?pa_brand links."""

from pathlib import Path

page = Path("/opt/bitnami/wordpress/wp-content/themes/modulargunworks/page-brands.php")
text = page.read_text(encoding="utf-8")

# Replace term loading + sort block with one that filters by real published products.
old_load = """$brand_terms = array();
if ( taxonomy_exists( 'pa_brand' ) ) {
	$terms = get_terms(
		array(
			'taxonomy'   => 'pa_brand',
			'hide_empty' => true,
			'orderby'    => 'name',
			'order'      => 'ASC',
		)
	);
	if ( ! is_wp_error( $terms ) ) {
		$brand_terms = $terms;
		// Brands with logos first, then A–Z within each group.
		usort(
			$brand_terms,
			static function ( $a, $b ) {
				$a_logo = function_exists( 'modulargunworks_get_brand_logo_url' ) && modulargunworks_get_brand_logo_url( $a ) !== '';
				$b_logo = function_exists( 'modulargunworks_get_brand_logo_url' ) && modulargunworks_get_brand_logo_url( $b ) !== '';
				if ( $a_logo !== $b_logo ) {
					return $a_logo ? -1 : 1;
				}
				return strcasecmp( $a->name, $b->name );
			}
		);
	}
}
"""

new_load = """$brand_terms = array();
if ( taxonomy_exists( 'pa_brand' ) ) {
	$terms = get_terms(
		array(
			'taxonomy'   => 'pa_brand',
			'hide_empty' => false,
			'orderby'    => 'name',
			'order'      => 'ASC',
		)
	);
	if ( ! is_wp_error( $terms ) ) {
		foreach ( $terms as $term ) {
			// Term counts are often stale from feed imports — require a real published product.
			$probe = new WP_Query(
				array(
					'post_type'              => 'product',
					'post_status'            => 'publish',
					'posts_per_page'         => 1,
					'fields'                 => 'ids',
					'no_found_rows'          => true,
					'update_post_meta_cache' => false,
					'update_post_term_cache' => false,
					'tax_query'              => array(
						array(
							'taxonomy' => 'pa_brand',
							'field'    => 'term_id',
							'terms'    => (int) $term->term_id,
						),
					),
				)
			);
			if ( empty( $probe->posts ) ) {
				continue;
			}
			$brand_terms[] = $term;
		}
		// Brands with logos first, then A–Z within each group.
		usort(
			$brand_terms,
			static function ( $a, $b ) {
				$a_logo = function_exists( 'modulargunworks_get_brand_logo_url' ) && modulargunworks_get_brand_logo_url( $a ) !== '';
				$b_logo = function_exists( 'modulargunworks_get_brand_logo_url' ) && modulargunworks_get_brand_logo_url( $b ) !== '';
				if ( $a_logo !== $b_logo ) {
					return $a_logo ? -1 : 1;
				}
				return strcasecmp( $a->name, $b->name );
			}
		);
	}
}
"""

if old_load not in text:
    raise SystemExit("load/sort block not found — page may already differ")
text = text.replace(old_load, new_load, 1)

# Ensure archive helper link (idempotent)
text2 = text.replace(
    """		$brand_url = get_term_link( $term );
		if ( is_wp_error( $brand_url ) ) {
			continue;
		}
""",
    """		$brand_url = function_exists( 'modulargunworks_get_brand_archive_url' )
			? modulargunworks_get_brand_archive_url( $term )
			: get_term_link( $term );
		if ( ! $brand_url || is_wp_error( $brand_url ) ) {
			continue;
		}
""",
)
page.write_text(text2, encoding="utf-8")
print("page-brands.php: filter to brands with published products")
