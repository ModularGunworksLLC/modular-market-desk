<?php
require '/opt/bitnami/wordpress/wp-load.php';
echo 'stylesheet=' . wp_get_theme()->get_stylesheet() . "\n";
echo 'template=' . wp_get_theme()->get_template() . "\n";
echo 'show_on_front=' . get_option('show_on_front') . "\n";
echo 'page_on_front=' . get_option('page_on_front') . "\n";
$p = get_post((int) get_option('page_on_front'));
if ($p) {
  echo 'front_title=' . $p->post_title . "\n";
  echo 'front_template=' . get_page_template_slug($p) . "\n";
}
