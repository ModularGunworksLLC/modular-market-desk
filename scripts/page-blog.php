<?php
/**
 * Template: Blog — lists published posts (not the Blog page itself).
 *
 * @package ModularGunworks
 */

defined( 'ABSPATH' ) || exit;

get_header();

$paged = max( 1, (int) get_query_var( 'paged' ), (int) get_query_var( 'page' ) );
$blog_query = new WP_Query(
	array(
		'post_type'           => 'post',
		'post_status'         => 'publish',
		'posts_per_page'      => 10,
		'paged'               => $paged,
		'ignore_sticky_posts' => true,
	)
);
?>
<main class="mgw-blog-page" style="max-width: 800px; margin: 0 auto; padding: 2rem;">
	<h1 class="page-title">Blog</h1>

	<?php if ( $blog_query->have_posts() ) : ?>
		<div class="blog-posts">
			<?php
			while ( $blog_query->have_posts() ) :
				$blog_query->the_post();
				?>
				<article <?php post_class( 'blog-post' ); ?>>
					<h2><a href="<?php the_permalink(); ?>"><?php the_title(); ?></a></h2>
					<p class="post-meta"><?php echo esc_html( get_the_date() ); ?></p>
					<?php the_excerpt(); ?>
					<a href="<?php the_permalink(); ?>" class="read-more">Read more →</a>
				</article>
			<?php endwhile; ?>
		</div>

		<?php
		$pagination = paginate_links(
			array(
				'total'   => (int) $blog_query->max_num_pages,
				'current' => $paged,
				'type'    => 'list',
			)
		);
		if ( $pagination ) {
			echo '<nav class="blog-pagination" aria-label="Blog pages">' . $pagination . '</nav>'; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
		}
		wp_reset_postdata();
		?>
	<?php else : ?>
		<p>No posts yet. Check back soon!</p>
	<?php endif; ?>
</main>
<style>
.blog-post{margin-bottom:2rem;padding-bottom:2rem;border-bottom:1px solid #e0e0e0;}
.blog-post h2{margin:0 0 .5rem;font-size:1.35rem;line-height:1.3;}
.blog-post h2 a{color:#1a2c4b;text-decoration:none;}
.blog-post h2 a:hover{color:var(--color-primary,#b22222);}
.blog-post .post-meta{color:#666;font-size:.9rem;margin:0 0 .75rem;}
.blog-post .read-more{color:var(--color-primary,#b22222);font-weight:600;text-decoration:none;}
.blog-post .read-more:hover{text-decoration:underline;}
.blog-pagination{margin:2rem 0 0;}
.blog-pagination .page-numbers{display:flex;gap:.5rem;list-style:none;padding:0;margin:0;flex-wrap:wrap;}
.blog-pagination .page-numbers li{margin:0;}
.blog-pagination a,.blog-pagination span{display:inline-block;padding:.35rem .7rem;border:1px solid #e0e0e0;border-radius:6px;text-decoration:none;color:#181a1b;}
.blog-pagination .current{background:#1a2c4b;color:#fff;border-color:#1a2c4b;}
</style>
<?php
get_footer();
