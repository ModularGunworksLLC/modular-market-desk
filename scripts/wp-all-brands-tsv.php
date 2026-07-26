<?php
require '/opt/bitnami/wordpress/wp-load.php';
$terms = get_terms( array( 'taxonomy' => 'pa_brand', 'hide_empty' => false ) );
usort(
	$terms,
	function ( $a, $b ) {
		return $b->count <=> $a->count;
	}
);
foreach ( $terms as $t ) {
	echo $t->count . "\t" . $t->slug . "\t" . $t->name . "\n";
}
