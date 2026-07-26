<?php
require '/opt/bitnami/wordpress/wp-load.php';
$terms = get_terms( array( 'taxonomy' => 'pa_brand', 'hide_empty' => false ) );
$with = 0;
$without = 0;
$examples = array();
foreach ( $terms as $t ) {
	$url = modulargunworks_get_brand_logo_url( $t );
	if ( $url ) {
		$with++;
		if ( count( $examples ) < 8 ) {
			$examples[] = $t->slug . ' => ' . $url;
		}
	} else {
		$without++;
	}
}
echo "with_logo=$with without=$without total=" . count( $terms ) . "\n";
echo implode( "\n", $examples ) . "\n";
echo 'files=' . count( glob( get_template_directory() . '/assets/images/brands/*' ) ) . "\n";
