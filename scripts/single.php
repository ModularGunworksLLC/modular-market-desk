<?php
/**
 * Single blog post template.
 *
 * @package ModularGunworks
 */

defined( 'ABSPATH' ) || exit;

get_header();
?>
<main class="mgw-single-post" style="max-width: 800px; margin: 0 auto; padding: 2rem;">
	<?php if ( have_posts() ) : ?>
		<?php
		while ( have_posts() ) :
			the_post();
			?>
			<article <?php post_class( 'single-post' ); ?>>
				<p class="post-back"><a href="<?php echo esc_url( home_url( '/blog/' ) ); ?>">← Back to Blog</a></p>
				<h1 class="page-title"><?php the_title(); ?></h1>
				<p class="post-meta"><?php echo esc_html( get_the_date() ); ?></p>
				<div class="entry-content">
					<?php the_content(); ?>
				</div>
			</article>
		<?php endwhile; ?>
	<?php else : ?>
		<p>Post not found.</p>
	<?php endif; ?>
</main>
<style>
.mgw-single-post .post-back{margin:0 0 1rem;}
.mgw-single-post .post-back a{color:#666;text-decoration:none;font-size:.95rem;}
.mgw-single-post .post-back a:hover{color:var(--color-primary,#b22222);}
.mgw-single-post .post-meta{color:#666;font-size:.95rem;margin:0 0 1.5rem;}
.mgw-single-post .entry-content{line-height:1.7;color:#181a1b;}
.mgw-single-post .entry-content p{margin:0 0 1rem;}
</style>
<?php
get_footer();
