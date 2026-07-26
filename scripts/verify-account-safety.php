<?php
require '/opt/bitnami/wordpress/wp-load.php';

$checks = array(
	'users_can_register' => get_option( 'users_can_register' ),
	'woocommerce_enable_myaccount_registration' => get_option( 'woocommerce_enable_myaccount_registration' ),
	'woocommerce_enable_signup_and_login_from_checkout' => get_option( 'woocommerce_enable_signup_and_login_from_checkout' ),
	'woocommerce_enable_guest_checkout' => get_option( 'woocommerce_enable_guest_checkout' ),
	'woocommerce_registration_generate_username' => get_option( 'woocommerce_registration_generate_username' ),
	'woocommerce_registration_generate_password' => get_option( 'woocommerce_registration_generate_password' ),
	'default_role' => get_option( 'default_role' ),
	'myaccount_page_id' => get_option( 'woocommerce_myaccount_page_id' ),
);

foreach ( $checks as $k => $v ) {
	echo $k . ' = ' . var_export( $v, true ) . "\n";
}

$customers = count( get_users( array( 'role' => 'customer', 'fields' => 'ID' ) ) );
echo "customer_count = {$customers}\n";

// Confirm page.php exists and uses the_content
$theme_page = get_template_directory() . '/page.php';
echo 'page.php_exists = ' . ( file_exists( $theme_page ) ? 'yes' : 'no' ) . "\n";
echo 'page.php_has_the_content = ' . ( str_contains( file_get_contents( $theme_page ), 'the_content' ) ? 'yes' : 'no' ) . "\n";
