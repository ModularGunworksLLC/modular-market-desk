<?php
/**
 * Default page template.
 *
 * Used for any Page that does not have a dedicated page-*.php override
 * (e.g. WooCommerce My Account). Must call the_content() so shortcodes run.
 *
 * @package ModularGunworks
 */

defined( 'ABSPATH' ) || exit;

get_header();
?>
<main class="mgw-page" style="max-width: 1200px; margin: 0 auto; padding: 2rem;">
	<?php if ( have_posts() ) : ?>
		<?php
		while ( have_posts() ) :
			the_post();
			?>
			<h1 class="page-title"><?php the_title(); ?></h1>
			<div class="entry-content">
				<?php the_content(); ?>
			</div>
		<?php endwhile; ?>
	<?php endif; ?>
</main>
<?php
get_footer();
