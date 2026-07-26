<?php
require '/opt/bitnami/wordpress/wp-load.php';

$rules = get_option( 'rewrite_rules' );
$brand_rules = array();
if ( is_array( $rules ) ) {
	foreach ( $rules as $pat => $dest ) {
		if ( stripos( $pat, 'brand' ) !== false || stripos( $dest, 'pa_brand' ) !== false ) {
			$brand_rules[ $pat ] = $dest;
		}
	}
}
echo 'brand_rule_count=' . count( $brand_rules ) . "\n";
foreach ( array_slice( $brand_rules, 0, 20, true ) as $pat => $dest ) {
	echo "$pat => $dest\n";
}

echo "--- flush ---\n";
flush_rewrite_rules( true );
$rules = get_option( 'rewrite_rules' );
$brand_rules = array();
foreach ( $rules as $pat => $dest ) {
	if ( stripos( $pat, 'brand' ) !== false || stripos( $dest, 'pa_brand' ) !== false ) {
		$brand_rules[ $pat ] = $dest;
	}
}
echo 'brand_rule_count_after=' . count( $brand_rules ) . "\n";
foreach ( array_slice( $brand_rules, 0, 20, true ) as $pat => $dest ) {
	echo "$pat => $dest\n";
}

$t = get_term_by( 'slug', 'sig-sauer', 'pa_brand' );
echo 'sig_link=' . get_term_link( $t ) . "\n";
