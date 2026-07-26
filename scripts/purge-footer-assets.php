<?php
require '/opt/bitnami/wordpress/wp-load.php';
$files = array(
	'/opt/bitnami/wordpress/wp-content/themes/modulargunworks/footer.php',
	'/opt/bitnami/wordpress/wp-content/themes/modulargunworks/assets/css/layout.css',
	'/opt/bitnami/wordpress/wp-content/themes/modulargunworks/functions.php',
);
foreach ( $files as $f ) {
	if ( function_exists( 'opcache_invalidate' ) ) {
		opcache_invalidate( $f, true );
	}
}
if ( class_exists( 'Breeze_PurgeCache' ) && method_exists( 'Breeze_PurgeCache', 'breeze_cache_flush' ) ) {
	Breeze_PurgeCache::breeze_cache_flush();
	echo "flushed\n";
}
