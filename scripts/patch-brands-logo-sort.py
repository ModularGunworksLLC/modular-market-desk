#!/usr/bin/env python3
from pathlib import Path

p = Path("/opt/bitnami/wordpress/wp-content/themes/modulargunworks/page-brands.php")
old = """	if ( ! is_wp_error( $terms ) ) {
		$brand_terms = $terms;
	}
}
"""
new = """	if ( ! is_wp_error( $terms ) ) {
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
text = p.read_text(encoding="utf-8")
if old not in text:
    raise SystemExit("sort insert point not found")
p.write_text(text.replace(old, new, 1), encoding="utf-8")
print("page-brands.php: logo-first sort added")
