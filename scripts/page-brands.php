<?php
/**
 * Template Name: Shop By Brand
 * Description: Grid of brand tiles linking to each brand's product listing (uses pa_brand + media images)
 */
defined( 'ABSPATH' ) || exit;

get_header( 'shop' );

$brand_terms = array();
if ( taxonomy_exists( 'pa_brand' ) ) {
	$terms = get_terms(
		array(
			'taxonomy'   => 'pa_brand',
			'hide_empty' => false,
			'orderby'    => 'name',
			'order'      => 'ASC',
		)
	);
	if ( ! is_wp_error( $terms ) ) {
		$brand_terms = $terms;
	}
}
?>
<main class="mgw-brands-main">
  <h1 class="page-title"><?php esc_html_e( 'Shop by Brand', 'modulargunworks' ); ?></h1>
  <p class="brands-subtitle"><?php esc_html_e( 'Browse our manufacturers. Click any brand to see all their products.', 'modulargunworks' ); ?></p>

  <?php if ( empty( $brand_terms ) ) : ?>
  <p class="no-brands"><?php esc_html_e( 'No brands available yet. Add the Brand attribute to products and assign brand images in Products → Attributes → Brand.', 'modulargunworks' ); ?></p>
  <?php else : ?>
  <div class="brands-grid">
    <?php
	foreach ( $brand_terms as $term ) :
		$brand_url = get_term_link( $term );
		if ( is_wp_error( $brand_url ) ) {
			continue;
		}
		$img_url = function_exists( 'modulargunworks_get_brand_logo_url' )
			? modulargunworks_get_brand_logo_url( $term )
			: '';
		?>
    <a href="<?php echo esc_url( $brand_url ); ?>" class="brand-card">
      <div class="brand-logo">
        <?php if ( $img_url ) : ?>
        <img src="<?php echo esc_url( $img_url ); ?>" alt="<?php echo esc_attr( $term->name ); ?> logo" loading="lazy" decoding="async" width="96" height="96">
        <?php else : ?>
        <span class="brand-logo-placeholder" aria-hidden="true"><?php echo esc_html( strtoupper( substr( $term->name, 0, 1 ) ) ); ?></span>
        <?php endif; ?>
      </div>
      <h3><?php echo esc_html( $term->name ); ?></h3>
      <p><?php printf( esc_html( _n( '%d product', '%d products', $term->count, 'modulargunworks' ) ), (int) $term->count ); ?></p>
    </a>
    <?php endforeach; ?>
  </div>
  <?php endif; ?>
</main>
<style>
.mgw-brands-main{max-width:1200px;margin:0 auto;padding:0 1.25rem 2.5rem;}
.brands-subtitle{color:#555;margin:0 0 1.5rem;}
.brands-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:1rem;}
.brand-card{display:flex;flex-direction:column;align-items:center;text-align:center;text-decoration:none;color:inherit;background:#fff;border:1px solid #e0e0e0;border-radius:10px;padding:1rem .75rem;transition:box-shadow .2s,border-color .2s;min-height:100%;}
.brand-card:hover{border-color:#b22222;box-shadow:0 4px 14px rgba(0,0,0,.08);}
.brand-logo{width:96px;height:96px;display:flex;align-items:center;justify-content:center;margin:0 auto .75rem;background:#f5f6f7;border-radius:10px;overflow:hidden;}
.brand-logo img{max-width:84px;max-height:84px;width:auto;height:auto;object-fit:contain;}
.brand-logo-placeholder{display:flex;align-items:center;justify-content:center;width:64px;height:64px;border-radius:10px;background:#1a2c4b;color:#fff;font-weight:700;font-size:1.4rem;}
.brand-card h3{font-size:.95rem;line-height:1.25;margin:0 0 .35rem;text-transform:none;letter-spacing:normal;color:#181a1b;}
.brand-card p{margin:0;color:#666;font-size:.8rem;}
</style>
<?php
get_footer( 'shop' );
