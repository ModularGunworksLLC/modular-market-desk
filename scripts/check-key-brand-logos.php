<?php
require '/opt/bitnami/wordpress/wp-load.php';

$slugs = array(
	'magpul',
	'magpul-accessories',
	'ruger',
	'sturm-ruger-co',
	'blue-force-gear',
	'iwi',
	'iwi-us-israel-weapon-industries',
);

foreach ( $slugs as $slug ) {
	$t = get_term_by( 'slug', $slug, 'pa_brand' );
	if ( ! $t ) {
		echo $slug . " MISSING_TERM\n";
		continue;
	}
	$url = modulargunworks_get_brand_logo_url( $t );
	echo $slug . ' => ' . $url . "\n";
}
