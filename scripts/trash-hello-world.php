<?php
/**
 * Optionally remove the default Hello World post so /blog/ is clean.
 * Safe to re-run: only trashes post ID 1 if it is still the default Hello world! post.
 */
require '/opt/bitnami/wordpress/wp-load.php';

$post = get_post( 1 );
if ( ! $post || $post->post_type !== 'post' ) {
	echo "no default post\n";
	exit( 0 );
}

$title = strtolower( trim( (string) $post->post_title ) );
$content = (string) $post->post_content;
$is_hello = ( $title === 'hello world!' )
	|| str_contains( $content, 'Welcome to WordPress. This is your first post.' );

if ( ! $is_hello ) {
	echo "post #1 is not Hello World — left alone ({$post->post_title})\n";
	exit( 0 );
}

if ( $post->post_status === 'trash' ) {
	echo "Hello World already trashed\n";
	exit( 0 );
}

wp_trash_post( 1 );
echo "trashed Hello World post #1\n";
