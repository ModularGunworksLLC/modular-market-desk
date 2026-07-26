#!/usr/bin/env python3
from pathlib import Path
import shutil

p = Path("/opt/bitnami/wordpress/wp-content/themes/modulargunworks/page-services.php")
p.write_text(
    """<?php
/**
 * Template: Services
 */
get_header();
?>
<main class="services-page">
  <h1 class="page-title">Our Services</h1>
  <div class="services-grid">
    <div class="service-card">
      <h2><i class="fas fa-wrench" aria-hidden="true"></i> Gunsmithing &amp; Basic Services</h2>
      <p>Cleaning, inspections, optics mounting, and simple sight work. We keep your firearms in top condition and are expanding toward full gunsmith certification.</p>
      <a href="<?php echo esc_url(home_url('/gunsmithing')); ?>" class="service-cta">See pricing &amp; details</a>
    </div>
    <div class="service-card">
      <h2><i class="fas fa-file-alt" aria-hidden="true"></i> FFL Transfers</h2>
      <p>Licensed FFL transfers for online and out-of-state purchases. We handle the compliance paperwork so your firearm is transferred legally and safely.</p>
      <a href="<?php echo esc_url(home_url('/ffl-transfers')); ?>" class="service-cta">Transfer info &amp; fees</a>
    </div>
    <div class="service-card">
      <h2><i class="fas fa-hand-holding-usd" aria-hidden="true"></i> Sell / Trade-In</h2>
      <p>Get a soft market estimate and submit photos online. We review every request in person before making an offer.</p>
      <a href="https://desk.modulargunworks.com/trade-in" class="service-cta" rel="noopener">Sell us your firearm</a>
    </div>
  </div>
  <div class="services-contact">
    <p>Ready to book? Choose a service above, then use the Request button on that service page. For other questions, <a href="<?php echo esc_url(home_url('/contact')); ?>">contact us</a>.</p>
  </div>
</main>
<style>
.services-page {
  max-width: 1120px;
  margin: 0 auto;
  padding: 0 1.25rem 2rem;
}
.services-page .page-title {
  text-align: center;
  margin-bottom: 1.75rem;
}
.services-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 1.5rem;
  margin: 0 auto 2rem;
  align-items: stretch;
}
.service-card {
  display: flex;
  flex-direction: column;
  background: #fafafa;
  border-left: 4px solid var(--color-primary);
  padding: 1.75rem 1.5rem;
  border-radius: 8px;
  box-shadow: 0 1px 3px rgba(0,0,0,.05);
  min-height: 100%;
}
.service-card h2 {
  font-size: 1.2rem;
  line-height: 1.35;
  margin: 0 0 0.85rem;
}
.service-card i {
  margin-right: .45rem;
  color: var(--color-primary);
}
.service-card p {
  color: #666;
  line-height: 1.55;
  margin: 0 0 1.25rem;
  flex: 1 1 auto;
}
.service-cta {
  display: inline-block;
  background: var(--color-primary);
  color: #fff;
  padding: .6rem 1.1rem;
  border-radius: 4px;
  text-decoration: none;
  font-weight: 600;
  margin-top: auto;
  align-self: flex-start;
}
.service-cta:hover {
  background: #8b1a1a;
  color: #fff;
}
.services-contact {
  text-align: center;
  padding-top: 1.5rem;
  border-top: 1px solid #e0e0e0;
  color: #666;
  max-width: 40rem;
  margin: 0 auto;
}
@media (max-width: 900px) {
  .services-grid {
    grid-template-columns: 1fr;
    max-width: 28rem;
  }
}
</style>
<?php get_footer(); ?>
""",
    encoding="utf-8",
)
print("page-services.php rewritten")

for root in (
    "/opt/bitnami/wordpress/wp-content/cache/breeze",
    "/opt/bitnami/wordpress/wp-content/cache/breeze-minification",
):
    r = Path(root)
    if r.is_dir():
        for c in list(r.iterdir()):
            if c.is_dir():
                shutil.rmtree(c, ignore_errors=True)
            else:
                try:
                    c.unlink()
                except OSError:
                    pass

# Invalidate opcache for this file if possible via separate php
print("cache cleared")
