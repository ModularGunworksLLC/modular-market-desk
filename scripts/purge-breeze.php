<?php
require '/opt/bitnami/wordpress/wp-load.php';
if ( class_exists( 'Breeze_PurgeCache' ) && method_exists( 'Breeze_PurgeCache', 'breeze_cache_flush' ) ) {
	Breeze_PurgeCache::breeze_cache_flush();
	echo "breeze_cache_flush\n";
} else {
	do_action( 'breeze_clear_all_cache' );
	echo "breeze_clear_all_cache\n";
}
