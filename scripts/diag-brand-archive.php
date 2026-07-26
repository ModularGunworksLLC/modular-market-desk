<?php
require '/opt/bitnami/wordpress/wp-load.php';

$slugs = array( 'aero-precision', 'sig-sauer', 'glock-inc', 'browning-clothing' );
foreach ( $slugs as $slug ) {
	$t = get_term_by( 'slug', $slug, 'pa_brand' );
	if ( ! $t ) {
		echo "MISSING $slug\n";
		continue;
	}
	$link = get_term_link( $t );
	echo "=== $slug ===\n";
	echo 'name=' . $t->name . " count={$t->count} id={$t->term_id}\n";
	echo 'link=' . ( is_wp_error( $link ) ? $link->get_error_message() : $link ) . "\n";

	$q = new WP_Query(
		array(
			'post_type'      => 'product',
			'post_status'    => 'publish',
			'posts_per_page' => 3,
			'tax_query'      => array(
				array(
					'taxonomy' => 'pa_brand',
					'field'    => 'term_id',
					'terms'    => $t->term_id,
				),
			),
		)
	);
	echo 'wp_query_found=' . $q->found_posts . "\n";

	// Also try product_visibility aware WC product query
	if ( function_exists( 'wc_get_products' ) ) {
		$products = wc_get_products(
			array(
				'status'   => 'publish',
				'limit'    => 3,
				'paginate' => true,
				'tax_query' => array(
					array(
						'taxonomy' => 'pa_brand',
						'field'    => 'term_id',
						'terms'    => $t->term_id,
					),
				),
			)
		);
		$total = is_array( $products ) && isset( $products['total'] ) ? $products['total'] : 'n/a';
		echo "wc_get_products_total=$total\n";
	}
}

$attrs = wc_get_attribute_taxonomies();
foreach ( $attrs as $a ) {
	if ( $a->attribute_name === 'brand' ) {
		echo 'attribute_name=brand public=' . $a->attribute_public . ' type=' . $a->attribute_type . "\n";
	}
}

echo 'permalink_structure=' . get_option( 'permalink_structure' ) . "\n";
echo 'woocommerce_permalinks=' . wp_json_encode( get_option( 'woocommerce_permalinks' ) ) . "\n";
