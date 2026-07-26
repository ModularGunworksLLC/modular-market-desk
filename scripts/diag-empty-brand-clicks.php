<?php
/**
 * Find brands shown on brands page that have term count > 0 but zero published products.
 */
require '/opt/bitnami/wordpress/wp-load.php';

$terms = get_terms(
	array(
		'taxonomy'   => 'pa_brand',
		'hide_empty' => true,
		'orderby'    => 'name',
		'order'      => 'ASC',
	)
);
if ( is_wp_error( $terms ) ) {
	fwrite( STDERR, $terms->get_error_message() );
	exit( 1 );
}

usort(
	$terms,
	static function ( $a, $b ) {
		$a_logo = function_exists( 'modulargunworks_get_brand_logo_url' ) && modulargunworks_get_brand_logo_url( $a ) !== '';
		$b_logo = function_exists( 'modulargunworks_get_brand_logo_url' ) && modulargunworks_get_brand_logo_url( $b ) !== '';
		if ( $a_logo !== $b_logo ) {
			return $a_logo ? -1 : 1;
		}
		return strcasecmp( $a->name, $b->name );
	}
);

$ok      = 0;
$bad     = 0;
$bad_rows = array();
foreach ( $terms as $t ) {
	$q = new WP_Query(
		array(
			'post_type'              => 'product',
			'post_status'            => 'publish',
			'posts_per_page'         => 1,
			'fields'                 => 'ids',
			'no_found_rows'          => false,
			'update_post_meta_cache' => false,
			'update_post_term_cache' => false,
			'tax_query'              => array(
				array(
					'taxonomy' => 'pa_brand',
					'field'    => 'term_id',
					'terms'    => $t->term_id,
				),
			),
		)
	);
	$found = (int) $q->found_posts;
	$logo  = function_exists( 'modulargunworks_get_brand_logo_url' ) && modulargunworks_get_brand_logo_url( $t ) !== '';
	if ( $found > 0 ) {
		$ok++;
	} else {
		$bad++;
		if ( count( $bad_rows ) < 40 ) {
			$bad_rows[] = sprintf(
				"%s\t%s\tterm_count=%d\tlogo=%s",
				$t->slug,
				$t->name,
				(int) $t->count,
				$logo ? 'yes' : 'no'
			);
		}
	}
}

echo "shown_on_page_terms=" . count( $terms ) . "\n";
echo "with_published_products=$ok\n";
echo "empty_despite_count=$bad\n";
echo "--- empty examples ---\n";
echo implode( "\n", $bad_rows ) . "\n";
