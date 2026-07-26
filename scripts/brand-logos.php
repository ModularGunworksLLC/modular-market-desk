<?php
/**
 * Brand logo resolution for Shop by Brand tiles.
 *
 * Order: Woo term thumbnail → local theme file (slug/alias) → placeholder.
 *
 * @package ModularGunworks
 */

defined( 'ABSPATH' ) || exit;

/**
 * Map pa_brand term slugs to files in assets/images/brands/.
 *
 * @return array<string, string> slug => filename
 */
function modulargunworks_brand_logo_aliases() {
	return array(
		// Existing files → common WooCommerce attribute slugs
		'aero-precision'                 => 'aero-precision.png',
		'athlon'                         => 'athlon.png',
		'athlon-optics'                  => 'athlon.png',
		'blackhawk'                      => 'blackhawk.png',
		'blue-force-gear'                => 'blue-force-gear.png',
		'browning'                       => 'browning.png',
		'browning-clothing'              => 'browning.png',
		'browning-firearms'              => 'browning.png',
		'burris'                         => 'burris.png',
		'burris-company-inc'             => 'burris.png',
		'daniel-defense'                 => 'daniel-defense.png',
		'federal'                        => 'federal.png',
		'federal-premium'                => 'federal.png',
		'fn-america'                     => 'fn-america.png',
		'fn-usa'                         => 'fn-america.png',
		'forster'                        => 'forster.png',
		'glock'                          => 'glock.png',
		'glock-inc'                      => 'glock.png',
		'hk'                             => 'hk.png',
		'heckler-koch'                   => 'hk.png',
		'heckler-koch-inc'               => 'hk.png',
		'hogue'                          => 'hogue.png',
		'holosun'                        => 'holosun.png',
		'hornady'                        => 'hornady.png',
		'hornady-reloading'              => 'hornady.png',
		'iwi'                            => 'iwi-us-israel-weapon-industries.png',
		'iwi-us'                         => 'iwi-us-israel-weapon-industries.png',
		'iwi-us-israel-weapon-industries'=> 'iwi-us-israel-weapon-industries.png',
		'israel-weapon-industries'       => 'iwi-us-israel-weapon-industries.png',
		'kimber'                         => 'kimber.png',
		'lee-precision'                  => 'lee-precision.png',
		'leupold'                        => 'leupold.png',
		'leupold-stevens-inc'            => 'leupold.png',
		'lyman'                          => 'lyman.png',
		'magpul'                         => 'magpul.png',
		'magpul-accessories'             => 'magpul.png',
		'meprolight'                     => 'meprolight.png',
		'mossberg'                       => 'mossberg.png',
		'nosler'                         => 'nosler.png',
		'promag'                         => 'promag.png',
		'rcbs'                           => 'rcbs.png',
		'redding'                        => 'redding.png',
		'redding-reloading-equipment'    => 'redding.png',
		'remington'                      => 'remington.png',
		'remington-firearms'             => 'remington.png',
		'ruger'                          => 'ruger.png',
		'sturm-ruger-co'                 => 'ruger.png',
		'sellmark'                       => 'sellmark.png',
		'sig-sauer'                      => 'sig-sauer.png',
		'smith-and-wesson'               => 'smith-and-wesson.png',
		'smith-wesson'                   => 'smith-and-wesson.png',
		'smith-wesson-inc'               => 'smith-and-wesson.png',
		'springfield-armory'             => 'springfield-armory.png',
		'surefire'                       => 'surefire.png',
		'truglo'                         => 'truglo.png',
		'walther'                        => 'walther.png',
		'walther-arms'                   => 'walther.png',
		'wilson-combat'                  => 'wilson-combat.png',
		'yankee-hill'                    => 'yankee-hill.png',
		'yankee-hill-machine'            => 'yankee-hill.png',
	);
}

/**
 * Absolute path to theme brand logos directory.
 *
 * @return string
 */
function modulargunworks_brand_logos_dir() {
	return get_template_directory() . '/assets/images/brands';
}

/**
 * Public URI to theme brand logos directory.
 *
 * @return string
 */
function modulargunworks_brand_logos_uri() {
	return get_template_directory_uri() . '/assets/images/brands';
}

/**
 * Resolve a local logo filename for a brand term, if present on disk.
 *
 * @param WP_Term $term Brand term.
 * @return string Filename or empty.
 */
function modulargunworks_resolve_brand_logo_file( $term ) {
	if ( ! ( $term instanceof WP_Term ) ) {
		return '';
	}
	$dir     = modulargunworks_brand_logos_dir();
	$aliases = modulargunworks_brand_logo_aliases();
	$slug    = strtolower( (string) $term->slug );

	$candidates = array();
	if ( isset( $aliases[ $slug ] ) ) {
		$candidates[] = $aliases[ $slug ];
	}
	foreach ( array( 'png', 'jpg', 'jpeg', 'webp', 'svg' ) as $ext ) {
		$candidates[] = $slug . '.' . $ext;
	}
	// Normalized slug (strip amp entities leftovers already handled by WP slugs)
	$norm = preg_replace( '/[^a-z0-9]+/', '-', $slug );
	$norm = trim( (string) $norm, '-' );
	if ( $norm && $norm !== $slug ) {
		foreach ( array( 'png', 'jpg', 'jpeg', 'webp', 'svg' ) as $ext ) {
			$candidates[] = $norm . '.' . $ext;
		}
	}

	foreach ( array_unique( $candidates ) as $file ) {
		$path = $dir . '/' . $file;
		if ( is_readable( $path ) ) {
			return $file;
		}
	}
	return '';
}

/**
 * Public URL for a brand logo image, or empty string.
 *
 * @param WP_Term $term Brand term.
 * @return string
 */
function modulargunworks_get_brand_logo_url( $term ) {
	if ( ! ( $term instanceof WP_Term ) ) {
		return '';
	}

	$thumb_id = (int) get_term_meta( $term->term_id, 'thumbnail_id', true );
	if ( $thumb_id > 0 ) {
		$url = wp_get_attachment_image_url( $thumb_id, 'medium' );
		if ( is_string( $url ) && $url !== '' ) {
			return $url;
		}
	}

	$file = modulargunworks_resolve_brand_logo_file( $term );
	if ( $file !== '' ) {
		$path = modulargunworks_brand_logos_dir() . '/' . $file;
		$url  = modulargunworks_brand_logos_uri() . '/' . rawurlencode( $file );
		if ( is_readable( $path ) ) {
			$url = add_query_arg( 'v', (string) filemtime( $path ), $url );
		}
		return $url;
	}

	return '';
}
