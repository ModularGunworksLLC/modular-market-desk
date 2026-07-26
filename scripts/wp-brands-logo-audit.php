<?php
require '/opt/bitnami/wordpress/wp-load.php';

$logo_dir = get_template_directory() . '/assets/images/brands';
$files = is_dir($logo_dir) ? scandir($logo_dir) : array();
$slugs_on_disk = array();
foreach ($files as $f) {
	if (preg_match('/^(.+)\.(png|jpe?g|webp|svg)$/i', $f, $m)) {
		$slugs_on_disk[ strtolower( $m[1] ) ] = $f;
	}
}

$terms = get_terms(
	array(
		'taxonomy'   => 'pa_brand',
		'hide_empty' => false,
		'orderby'    => 'name',
	)
);
if ( is_wp_error( $terms ) ) {
	fwrite( STDERR, $terms->get_error_message() );
	exit( 1 );
}

$with_thumb = 0;
$with_file  = 0;
$missing    = array();
foreach ( $terms as $t ) {
	$tid = get_term_meta( $t->term_id, 'thumbnail_id', true );
	$has_thumb = (bool) $tid;
	if ( $has_thumb ) {
		$with_thumb++;
	}
	$slug = strtolower( $t->slug );
	$has_file = isset( $slugs_on_disk[ $slug ] );
	// fuzzy: strip non-alnum
	if ( ! $has_file ) {
		foreach ( $slugs_on_disk as $fs => $_ ) {
			if ( str_replace( array( '-', '_' ), '', $fs ) === str_replace( array( '-', '_' ), '', $slug ) ) {
				$has_file = true;
				break;
			}
		}
	}
	if ( $has_file ) {
		$with_file++;
	}
	if ( ! $has_thumb && ! $has_file ) {
		$missing[] = array(
			'id'    => $t->term_id,
			'name'  => $t->name,
			'slug'  => $t->slug,
			'count' => $t->count,
		);
	}
}

echo 'total=' . count( $terms ) . "\n";
echo "with_woo_thumb=$with_thumb\n";
echo 'logo_files_on_disk=' . count( $slugs_on_disk ) . "\n";
echo "matched_file_by_slug=$with_file\n";
echo 'missing=' . count( $missing ) . "\n";
echo "--- missing brands ---\n";
foreach ( $missing as $m ) {
	echo $m['count'] . "\t" . $m['slug'] . "\t" . $m['name'] . "\n";
}
echo "--- disk logos ---\n";
foreach ( $slugs_on_disk as $s => $f ) {
	echo "$s\t$f\n";
}
