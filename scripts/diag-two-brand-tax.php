<?php
require '/opt/bitnami/wordpress/wp-load.php';
global $wpdb;

foreach ( array( 'product_brand', 'pa_brand' ) as $tax ) {
	$terms = get_terms( array( 'taxonomy' => $tax, 'hide_empty' => true, 'number' => 5, 'orderby' => 'count', 'order' => 'DESC' ) );
	echo "=== $tax hide_empty top ===\n";
	if ( is_wp_error( $terms ) ) {
		echo $terms->get_error_message() . "\n";
		continue;
	}
	echo 'count_terms=' . count( get_terms( array( 'taxonomy' => $tax, 'hide_empty' => false, 'fields' => 'ids' ) ) ) . "\n";
	echo 'count_terms_with_posts=' . count( get_terms( array( 'taxonomy' => $tax, 'hide_empty' => true, 'fields' => 'ids' ) ) ) . "\n";
	foreach ( $terms as $t ) {
		$link = get_term_link( $t );
		$q = new WP_Query(
			array(
				'post_type'      => 'product',
				'post_status'    => 'publish',
				'posts_per_page' => 1,
				'fields'         => 'ids',
				'tax_query'      => array(
					array(
						'taxonomy' => $tax,
						'field'    => 'term_id',
						'terms'    => $t->term_id,
					),
				),
			)
		);
		echo "{$t->slug} term_count={$t->count} query={$q->found_posts} link=" . ( is_wp_error( $link ) ? 'err' : $link ) . "\n";
	}
}

// Does product_brand have aero-precision?
foreach ( array( 'aero-precision', 'sig-sauer', 'glock', 'glock-inc' ) as $slug ) {
	$a = get_term_by( 'slug', $slug, 'product_brand' );
	$b = get_term_by( 'slug', $slug, 'pa_brand' );
	echo "slug=$slug product_brand=" . ( $a ? "yes#{$a->count}" : 'no' ) . ' pa_brand=' . ( $b ? "yes#{$b->count}" : 'no' ) . "\n";
}

// Which plugin registers product_brand?
echo "product_brand_object=" . wp_json_encode( get_taxonomy( 'product_brand' ) ) . "\n";
