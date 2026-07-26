<?php
/**
 * Diagnose WooCommerce / WP customer account capability on live site.
 */
require '/opt/bitnami/wordpress/wp-load.php';

echo "=== WordPress users ===\n";
$counts = count_users();
print_r( $counts );

echo "\n=== Roles ===\n";
global $wp_roles;
foreach ( $wp_roles->roles as $key => $role ) {
	echo "- {$key}: {$role['name']}\n";
}

echo "\n=== WooCommerce account options ===\n";
$opts = array(
	'woocommerce_enable_myaccount_registration',
	'woocommerce_registration_generate_username',
	'woocommerce_registration_generate_password',
	'woocommerce_enable_signup_and_login_from_checkout',
	'woocommerce_enable_checkout_login_reminder',
	'woocommerce_myaccount_page_id',
	'users_can_register',
	'default_role',
	'woocommerce_enable_guest_checkout',
);
foreach ( $opts as $o ) {
	$v = get_option( $o );
	if ( is_bool( $v ) ) {
		$v = $v ? 'true' : 'false';
	}
	echo "{$o} = " . var_export( $v, true ) . "\n";
}

echo "\n=== Customer role users (sample) ===\n";
$customers = get_users(
	array(
		'role'   => 'customer',
		'number' => 10,
		'fields' => array( 'ID', 'user_login', 'user_email', 'user_registered' ),
	)
);
if ( empty( $customers ) ) {
	echo "(none)\n";
} else {
	foreach ( $customers as $u ) {
		echo "#{$u->ID} {$u->user_login} <{$u->user_email}> registered={$u->user_registered}\n";
	}
}

echo "\n=== All users sample (first 15) ===\n";
$users = get_users(
	array(
		'number' => 15,
		'orderby' => 'ID',
		'fields' => array( 'ID', 'user_login', 'user_email', 'user_registered' ),
	)
);
foreach ( $users as $u ) {
	$roles = implode( ',', (array) $u->roles );
	// get roles properly
	$user = new WP_User( $u->ID );
	$roles = implode( ',', $user->roles );
	echo "#{$u->ID} {$u->user_login} <{$u->user_email}> roles=[{$roles}] registered={$u->user_registered}\n";
}

echo "\n=== Active plugins (account-related) ===\n";
$active = get_option( 'active_plugins', array() );
foreach ( $active as $plugin ) {
	if ( preg_match( '/woo|account|auth|login|member|user|customer/i', $plugin ) ) {
		echo "- {$plugin}\n";
	}
}
echo "total_active_plugins=" . count( $active ) . "\n";
