<?php
require '/opt/bitnami/wordpress/wp-load.php';
global $wpdb;

echo "taxonomies with brand:\n";
foreach ( get_taxonomies( array(), 'objects' ) as $tax ) {
	if ( stripos( $tax->name, 'brand' ) !== false ) {
		echo $tax->name . ' public=' . (int) $tax->public . ' rewrite=' . wp_json_encode( $tax->rewrite ) . "\n";
	}
}

// Sample product with brand
$ids = $wpdb->get_col(
	"SELECT object_id FROM {$wpdb->term_relationships} tr
	 INNER JOIN {$wpdb->term_taxonomy} tt ON tr.term_taxonomy_id = tt.term_taxonomy_id
	 WHERE tt.taxonomy = 'pa_brand' LIMIT 5"
);
echo "sample_object_ids=" . implode( ',', $ids ) . "\n";
foreach ( $ids as $id ) {
	$post = get_post( $id );
	echo "id=$id type={$post->post_type} status={$post->post_status} title={$post->post_title}\n";
	$terms = wp_get_post_terms( $id, 'pa_brand' );
	foreach ( $terms as $t ) {
		echo "  brand={$t->slug}\n";
	}
}

// Why aero-precision count 130 but query 0?
$tt = $wpdb->get_row( "SELECT * FROM {$wpdb->term_taxonomy} WHERE taxonomy='pa_brand' AND term_id=911" );
echo 'aero_tt=' . wp_json_encode( $tt ) . "\n";
$rels = (int) $wpdb->get_var(
	$wpdb->prepare(
		"SELECT COUNT(*) FROM {$wpdb->term_relationships} WHERE term_taxonomy_id=%d",
		$tt->term_taxonomy_id
	)
);
echo "aero_relationships=$rels\n";
$pub = (int) $wpdb->get_var(
	$wpdb->prepare(
		"SELECT COUNT(*) FROM {$wpdb->term_relationships} tr
		 INNER JOIN {$wpdb->posts} p ON p.ID = tr.object_id
		 WHERE tr.term_taxonomy_id=%d AND p.post_type='product' AND p.post_status='publish'",
		$tt->term_taxonomy_id
	)
);
echo "aero_published_products=$pub\n";
$any_status = $wpdb->get_results(
	$wpdb->prepare(
		"SELECT p.post_status, COUNT(*) c FROM {$wpdb->term_relationships} tr
		 INNER JOIN {$wpdb->posts} p ON p.ID = tr.object_id
		 WHERE tr.term_taxonomy_id=%d
		 GROUP BY p.post_status",
		$tt->term_taxonomy_id
	)
);
echo 'aero_by_status=' . wp_json_encode( $any_status ) . "\n";

// Check variations - maybe brands on variations only?
$var = (int) $wpdb->get_var(
	$wpdb->prepare(
		"SELECT COUNT(*) FROM {$wpdb->term_relationships} tr
		 INNER JOIN {$wpdb->posts} p ON p.ID = tr.object_id
		 WHERE tr.term_taxonomy_id=%d AND p.post_type='product_variation'",
		$tt->term_taxonomy_id
	)
);
echo "aero_variations=$var\n";
