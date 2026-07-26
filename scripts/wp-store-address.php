<?php
require '/opt/bitnami/wordpress/wp-load.php';
$keys = array(
  'mgw_store_street',
  'mgw_store_city',
  'mgw_store_state',
  'mgw_store_zip',
  'mgw_store_phone',
  'mgw_google_maps_embed_url',
  'mgw_ffl_pdf_url',
);
foreach ($keys as $k) {
  $v = get_theme_mod($k, null);
  echo $k . '=' . json_encode($v) . PHP_EOL;
}
if (function_exists('modulargunworks_get_address_display')) {
  echo 'display=' . json_encode(modulargunworks_get_address_display()) . PHP_EOL;
}
