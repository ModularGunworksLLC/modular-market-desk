<?php
require '/opt/bitnami/wordpress/wp-load.php';
$terms = get_terms( array( 'taxonomy' => 'pa_brand', 'hide_empty' => false ) );
usort(
	$terms,
	function ( $a, $b ) {
		return $b->count <=> $a->count;
	}
);
foreach ( array_slice( $terms, 0, 80 ) as $t ) {
	echo $t->count . "\t" . $t->slug . "\t" . $t->name . "\n";
}
echo "--- files ---\n";
foreach ( scandir( get_template_directory() . '/assets/images/brands' ) as $f ) {
	if ( $f[0] === '.' ) {
		continue;
	}
	echo "$f\n";
}
