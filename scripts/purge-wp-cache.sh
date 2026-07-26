#!/bin/bash
set -e
FOOTER=/opt/bitnami/wordpress/wp-content/themes/modulargunworks/footer.php
sudo sed -i "s/Visit \& contact/Contact/g" "$FOOTER"
sudo rm -rf /opt/bitnami/wordpress/wp-content/cache/breeze/* /opt/bitnami/wordpress/wp-content/cache/breeze-minification/* || true
sudo /opt/bitnami/php/bin/php <<'PHP'
<?php
require '/opt/bitnami/wordpress/wp-load.php';
if (class_exists('Breeze_PurgeCache') && method_exists('Breeze_PurgeCache', 'breeze_cache_flush')) {
  Breeze_PurgeCache::breeze_cache_flush();
  echo "breeze_cache_flush\n";
} else {
  do_action('breeze_clear_all_cache');
  echo "breeze_clear_all_cache action\n";
}
PHP
echo "done"
