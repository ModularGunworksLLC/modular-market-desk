<?php
/**
 * Flush rewrites after pa_brand slug change.
 */
require '/opt/bitnami/wordpress/wp-load.php';

echo 'rewrite_filter=' . ( function_exists( 'modulargunworks_pa_brand_taxonomy_args' ) ? 'loaded' : 'MISSING' ) . "\n";

delete_transient( 'wc_attribute_taxonomies' );
if ( function_exists( 'wc_get_attribute_taxonomies' ) ) {
	wc_get_attribute_taxonomies();
}

// Re-init attribute taxonomies if possible
if ( function_exists( 'WC' ) && WC()->attributes ) {
	// no-op; flush is the important part
}

flush_rewrite_rules( true );
echo "rewrites_flushed\n";

$rules = get_option( 'rewrite_rules' );
$hits  = 0;
foreach ( (array) $rules as $pat => $dest ) {
	if ( strpos( $pat, 'manufacturer' ) !== false || strpos( $dest, 'pa_brand' ) !== false ) {
		echo "$pat => $dest\n";
		$hits++;
		if ( $hits >= 12 ) {
			break;
		}
	}
}

$t = get_term_by( 'slug', 'sig-sauer', 'pa_brand' );
if ( $t ) {
	$link = get_term_link( $t );
	echo 'sig_term_link=' . ( is_wp_error( $link ) ? $link->get_error_message() : $link ) . "\n";
	echo 'sig_helper=' . modulargunworks_get_brand_archive_url( $t ) . "\n";
}
