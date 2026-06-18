<?php
/**
 * Plugin Name: MGW Product Schema (Merchant + Reviews)
 * Description: Adds Google Merchant shippingDetails + hasMerchantReturnPolicy to WooCommerce Product offers. Adds aggregateRating/review only when a product has real reviews.
 * Version: 1.0.0
 * Author: Modular Gunworks
 *
 * Install: copy to wp-content/mu-plugins/mgw-wc-product-schema.php
 * Policies: https://www.modulargunworks.com/returns
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/** Default US shipping rate shown in schema when no product-specific rate is available (USD). */
const MGW_SCHEMA_DEFAULT_SHIP_RATE = 9.95;

/** Handling / transit estimates (business days). */
const MGW_SCHEMA_HANDLING_DAYS_MAX = 1;
const MGW_SCHEMA_TRANSIT_DAYS_MIN    = 2;
const MGW_SCHEMA_TRANSIT_DAYS_MAX    = 7;

/**
 * Merchant return policy for eligible non-regulated merchandise (see /returns).
 * Firearms/ammo are final after transfer — schema uses the accessory/general policy Google expects on offers.
 */
function mgw_schema_return_policy(): array {
	return array(
		'@type'                => 'MerchantReturnPolicy',
		'applicableCountry'    => 'US',
		'returnPolicyCategory' => 'https://schema.org/MerchantReturnFiniteReturnWindow',
		'merchantReturnDays'   => 30,
		'returnMethod'         => 'https://schema.org/ReturnByMail',
		'returnFees'           => 'https://schema.org/ReturnFeesCustomerResponsibility',
		'returnPolicyUrl'      => 'https://www.modulargunworks.com/returns',
	);
}

/**
 * Offer shipping details — US destination, flat representative rate.
 * Adjust MGW_SCHEMA_DEFAULT_SHIP_RATE or extend mgw_schema_shipping_rate() for zone logic.
 */
function mgw_schema_shipping_details( float $rate ): array {
	return array(
		'@type'               => 'OfferShippingDetails',
		'shippingRate'        => array(
			'@type'    => 'MonetaryAmount',
			'value'    => number_format( max( 0, $rate ), 2, '.', '' ),
			'currency' => get_woocommerce_currency() ?: 'USD',
		),
		'shippingDestination' => array(
			'@type'          => 'DefinedRegion',
			'addressCountry' => 'US',
		),
		'deliveryTime'        => array(
			'@type'        => 'ShippingDeliveryTime',
			'handlingTime' => array(
				'@type'    => 'QuantitativeValue',
				'minValue' => 0,
				'maxValue' => MGW_SCHEMA_HANDLING_DAYS_MAX,
				'unitCode' => 'DAY',
			),
			'transitTime'  => array(
				'@type'    => 'QuantitativeValue',
				'minValue' => MGW_SCHEMA_TRANSIT_DAYS_MIN,
				'maxValue' => MGW_SCHEMA_TRANSIT_DAYS_MAX,
				'unitCode' => 'DAY',
			),
		),
	);
}

/**
 * Pick a shipping rate for schema: product shipping class cost hint or store default.
 */
function mgw_schema_shipping_rate( WC_Product $product ): float {
	$rate = MGW_SCHEMA_DEFAULT_SHIP_RATE;

	if ( function_exists( 'WC' ) && WC()->shipping() ) {
		$zones = WC_Shipping_Zones::get_zones();
		foreach ( $zones as $zone ) {
			foreach ( $zone['shipping_methods'] as $method ) {
				if ( ! is_object( $method ) || ! $method->is_enabled() ) {
					continue;
				}
				if ( method_exists( $method, 'get_option' ) ) {
					$cost = $method->get_option( 'cost' );
					if ( is_numeric( $cost ) && (float) $cost > 0 ) {
						$rate = min( $rate, (float) $cost );
					}
				}
			}
		}
	}

	return (float) apply_filters( 'mgw_schema_shipping_rate', $rate, $product );
}

/**
 * Merchant listings: shipping + returns on each Offer.
 */
add_filter( 'woocommerce_structured_data_product_offer', 'mgw_schema_enrich_offer', 10, 2 );
function mgw_schema_enrich_offer( array $markup, WC_Product $product ): array {
	$rate = mgw_schema_shipping_rate( $product );

	$markup['shippingDetails']          = mgw_schema_shipping_details( $rate );
	$markup['hasMerchantReturnPolicy']  = mgw_schema_return_policy();

	return $markup;
}

/**
 * Product snippets: review + aggregateRating only when WooCommerce has real approved reviews.
 * Do NOT fabricate ratings — Google requires visible on-page reviews.
 */
add_filter( 'woocommerce_structured_data_product', 'mgw_schema_enrich_product_reviews', 20, 2 );
function mgw_schema_enrich_product_reviews( array $markup, WC_Product $product ): array {
	$count = (int) $product->get_review_count();
	$avg   = (float) $product->get_average_rating();

	if ( $count < 1 || $avg <= 0 ) {
		return $markup;
	}

	$markup['aggregateRating'] = array(
		'@type'       => 'AggregateRating',
		'ratingValue' => number_format( $avg, 1, '.', '' ),
		'reviewCount' => $count,
		'bestRating'  => '5',
		'worstRating' => '1',
	);

	$reviews = get_comments(
		array(
			'post_id' => $product->get_id(),
			'status'  => 'approve',
			'type'    => 'review',
			'number'  => 5,
		)
	);

	if ( $reviews ) {
		$markup['review'] = array();
		foreach ( $reviews as $comment ) {
			$rating = (int) get_comment_meta( $comment->comment_ID, 'rating', true );
			if ( $rating < 1 ) {
				continue;
			}
			$markup['review'][] = array(
				'@type'         => 'Review',
				'author'        => array(
					'@type' => 'Person',
					'name'  => $comment->comment_author ?: 'Customer',
				),
				'datePublished' => mysql2date( 'c', $comment->comment_date_gmt, false ),
				'reviewBody'    => wp_strip_all_tags( $comment->comment_content ),
				'reviewRating'  => array(
					'@type'       => 'Rating',
					'ratingValue' => $rating,
					'bestRating'  => '5',
					'worstRating' => '1',
				),
			);
		}
		if ( empty( $markup['review'] ) ) {
			unset( $markup['review'] );
		}
	}

	return $markup;
}

/**
 * WooCommerce 10+ may nest offers under priceSpecification — ensure enrichment on nested offers too.
 */
add_filter( 'woocommerce_structured_data_product', 'mgw_schema_enrich_offers_array', 25, 2 );
function mgw_schema_enrich_offers_array( array $markup, WC_Product $product ): array {
	if ( empty( $markup['offers'] ) || ! is_array( $markup['offers'] ) ) {
		return $markup;
	}

	$rate   = mgw_schema_shipping_rate( $product );
	$ship   = mgw_schema_shipping_details( $rate );
	$policy = mgw_schema_return_policy();

	foreach ( $markup['offers'] as $i => $offer ) {
		if ( ! is_array( $offer ) ) {
			continue;
		}
		$markup['offers'][ $i ]['shippingDetails']         = $ship;
		$markup['offers'][ $i ]['hasMerchantReturnPolicy'] = $policy;
	}

	return $markup;
}
