<?php
require '/opt/bitnami/wordpress/wp-load.php';

echo "=== Blog page ===\n";
$page = get_page_by_path( 'blog' );
if ( ! $page ) {
	// try by title
	$pages = get_posts(
		array(
			'name'        => 'blog',
			'post_type'   => 'page',
			'post_status' => 'any',
			'numberposts' => 1,
		)
	);
	$page = $pages[0] ?? null;
}
if ( $page ) {
	echo "id={$page->ID}\n";
	echo "title={$page->post_title}\n";
	echo "status={$page->post_status}\n";
	echo "template=" . get_page_template_slug( $page->ID ) . "\n";
	echo "content_len=" . strlen( $page->post_content ) . "\n";
	echo "content=[[" . $page->post_content . "]]\n";
} else {
	echo "NO blog page found\n";
}

echo "\n=== page-blog.php exists? ===\n";
$theme = get_template_directory();
echo file_exists( $theme . '/page-blog.php' ) ? "yes\n" : "no\n";
echo file_exists( $theme . '/home.php' ) ? "home.php yes\n" : "home.php no\n";
echo file_exists( $theme . '/page.php' ) ? "page.php yes\n" : "page.php no\n";
echo file_exists( $theme . '/index.php' ) ? "index.php yes\n" : "index.php no\n";
echo file_exists( $theme . '/archive.php' ) ? "archive.php yes\n" : "archive.php no\n";
echo file_exists( $theme . '/single.php' ) ? "single.php yes\n" : "single.php no\n";

echo "\n=== Reading settings ===\n";
echo 'show_on_front=' . get_option( 'show_on_front' ) . "\n";
echo 'page_on_front=' . get_option( 'page_on_front' ) . "\n";
echo 'page_for_posts=' . get_option( 'page_for_posts' ) . "\n";
if ( get_option( 'page_for_posts' ) ) {
	$pfp = get_post( (int) get_option( 'page_for_posts' ) );
	if ( $pfp ) {
		echo "posts_page_title={$pfp->post_title} slug={$pfp->post_name}\n";
	}
}

echo "\n=== Recent posts ===\n";
$posts = get_posts(
	array(
		'numberposts' => 10,
		'post_status' => 'any',
		'orderby'     => 'date',
		'order'       => 'DESC',
	)
);
foreach ( $posts as $post ) {
	echo "#{$post->ID} [{$post->post_status}] {$post->post_date} {$post->post_title}\n";
	echo '  excerpt_len=' . strlen( $post->post_excerpt ) . ' content_len=' . strlen( $post->post_content ) . "\n";
	echo '  content_snip=' . substr( wp_strip_all_tags( $post->post_content ), 0, 120 ) . "\n";
}
