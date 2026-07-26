<?php
require '/opt/bitnami/wordpress/wp-load.php';
$p = get_page_by_path( 'brands' );
if ( ! $p ) {
	echo "no brands page\n";
	exit;
}
echo 'id=' . $p->ID . "\n";
echo 'template=' . get_page_template_slug( $p->ID ) . "\n";
echo 'status=' . $p->post_status . "\n";
echo 'file_exists_brand_logos=' . ( function_exists( 'modulargunworks_get_brand_logo_url' ) ? 'yes' : 'no' ) . "\n";

$terms = get_terms(
	array(
		'taxonomy'   => 'pa_brand',
		'hide_empty' => true,
		'orderby'    => 'name',
		'order'      => 'ASC',
	)
);
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
echo "sorted_first10:\n";
foreach ( array_slice( $terms, 0, 10 ) as $t ) {
	$url = modulargunworks_get_brand_logo_url( $t );
	echo ( $url ? 'LOGO' : '----' ) . ' ' . $t->name . "\n";
}
