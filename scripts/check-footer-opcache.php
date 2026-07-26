<?php
require '/opt/bitnami/wordpress/wp-load.php';
$dir = get_template_directory();
echo "template_dir=$dir\n";
$footer = $dir . '/footer.php';
echo "footer_mtime=" . date('c', filemtime($footer)) . "\n";
$chunk = file_get_contents($footer);
$pos = strpos($chunk, 'footer-local-strip');
echo substr($chunk, $pos, 420) . "\n";
if (function_exists('opcache_invalidate')) {
	opcache_invalidate($footer, true);
	echo "opcache_invalidate=ok\n";
}
if (function_exists('opcache_reset')) {
	echo 'opcache_reset=' . (opcache_reset() ? '1' : '0') . "\n";
}
if (class_exists('Breeze_PurgeCache') && method_exists('Breeze_PurgeCache', 'breeze_cache_flush')) {
	Breeze_PurgeCache::breeze_cache_flush();
	echo "breeze flushed\n";
}
// Render front page HTML snippet via internal request? Just output what WP would include.
ob_start();
// Don't fully bootstrap theme render — too heavy. Check for object cache of page.
echo "done\n";
