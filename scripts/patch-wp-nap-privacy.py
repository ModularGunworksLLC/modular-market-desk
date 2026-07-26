#!/usr/bin/env python3
"""Privacy-safe public NAP: city/contact only; shipping address on request."""

from pathlib import Path

THEME = Path("/opt/bitnami/wordpress/wp-content/themes/modulargunworks")


def backup(path: Path) -> None:
    bak = path.with_suffix(path.suffix + ".bak-nap-privacy")
    if not bak.exists():
        bak.write_bytes(path.read_bytes())


def patch_ffl() -> None:
    p = THEME / "page-ffl-transfers.php"
    backup(p)
    text = p.read_text(encoding="utf-8")
    old = """  <?php if ( function_exists( 'modulargunworks_get_address_display' ) ) : ?>
  <div class="section ffl-nap-box">
    <h2><i class="fas fa-map-pin"></i> <?php esc_html_e( 'Ship firearms here', 'modulargunworks' ); ?></h2>
    <p class="ffl-nap-lines"><?php echo esc_html( modulargunworks_get_address_display() ); ?></p>
    <p class="ffl-nap-meta"><?php esc_html_e( 'Phone:', 'modulargunworks' ); ?> <a href="tel:+12563843852">(256) 384-3852</a> · <?php esc_html_e( 'Hours: M-F 9–6, Sat 10–4 CT', 'modulargunworks' ); ?></p>
    <p class="ffl-nap-help"><?php esc_html_e( 'Confirm the legal business name on your retailer’s FFL selector matches our license. Upload our license file below for their records.', 'modulargunworks' ); ?></p>
  </div>
  <?php endif; ?>
"""
    new = """  <div class="section ffl-nap-box">
    <h2><i class="fas fa-map-pin"></i> <?php esc_html_e( 'Huntsville-area receiving FFL', 'modulargunworks' ); ?></h2>
    <p class="ffl-nap-lines"><?php esc_html_e( 'Huntsville, AL — contact us for FFL shipping details', 'modulargunworks' ); ?></p>
    <p class="ffl-nap-meta"><?php esc_html_e( 'Phone:', 'modulargunworks' ); ?> <a href="tel:+12563843852">(256) 384-3852</a> · <?php esc_html_e( 'Hours: M-F 9–6, Sat 10–4 CT', 'modulargunworks' ); ?></p>
    <p class="ffl-nap-help"><?php esc_html_e( 'We provide our licensed premises address and FFL paperwork to you or your seller after you request a transfer. Do not ship until we confirm. Legal business name: Modular Gunworks LLC.', 'modulargunworks' ); ?></p>
  </div>
"""
    if old not in text:
        raise SystemExit("ffl-transfers: block not found")
    p.write_text(text.replace(old, new, 1), encoding="utf-8")

    text = p.read_text(encoding="utf-8")
    text = text.replace(
        "Use our FFL information when you checkout with your online seller so the package routes to Modular Gunworks LLC.",
        "Request a transfer with us first — we send FFL shipping details to you or your seller, then you check out so the package routes to Modular Gunworks LLC.",
        1,
    )
    text = text.replace(
        "During online checkout choose “FFL transfer,” search for Modular Gunworks LLC, and upload our license if the seller requests it. When in doubt, email us the order confirmation so we can watch for the tracking number.",
        "Contact us (or use Request FFL transfer) before checkout. We send our FFL details to you or your seller. Then choose FFL transfer at checkout and upload our license if they ask. Email us the order confirmation and tracking when you have them.",
        1,
    )
    p.write_text(text, encoding="utf-8")
    print("page-ffl-transfers.php: updated")


def patch_contact() -> None:
    p = THEME / "page-contact.php"
    backup(p)
    text = p.read_text(encoding="utf-8")
    text = text.replace(
        "Questions about orders, transfers, or services? Call, email, or visit our Huntsville-area FFL storefront.",
        "Questions about orders, transfers, or services? Call or email our Huntsville-area FFL.",
        1,
    )
    old_loc = """          <h3><?php esc_html_e( 'Location', 'modulargunworks' ); ?></h3>
          <?php if ( function_exists( 'modulargunworks_get_address_display' ) ) : ?>
            <p class="contact-address-block"><?php echo esc_html( modulargunworks_get_address_display() ); ?></p>
          <?php else : ?>
            <p>Huntsville, AL</p>
          <?php endif; ?>
          <p><strong><?php esc_html_e( 'Hours:', 'modulargunworks' ); ?></strong> <?php esc_html_e( 'M-F 9AM-6PM, Sat 10AM-4PM CT', 'modulargunworks' ); ?></p>
"""
    new_loc = """          <h3><?php esc_html_e( 'Location', 'modulargunworks' ); ?></h3>
          <p class="contact-address-block"><?php esc_html_e( 'Huntsville, AL — Huntsville-area FFL', 'modulargunworks' ); ?></p>
          <p class="contact-address-note"><?php esc_html_e( 'Full shipping address provided when you arrange a transfer.', 'modulargunworks' ); ?></p>
          <p><strong><?php esc_html_e( 'Hours:', 'modulargunworks' ); ?></strong> <?php esc_html_e( 'M-F 9AM-6PM, Sat 10AM-4PM CT', 'modulargunworks' ); ?></p>
"""
    if old_loc not in text:
        raise SystemExit("contact: location block not found")
    p.write_text(text.replace(old_loc, new_loc, 1), encoding="utf-8")
    print("page-contact.php: updated")


def patch_footer() -> None:
    p = THEME / "footer.php"
    backup(p)
    text = p.read_text(encoding="utf-8")
    old = """      <?php if (function_exists('modulargunworks_get_address_display')) :
        $addr = modulargunworks_get_address_display();
        ?>
      <strong>Location:</strong><br><span class="footer-address-block"><?php echo esc_html($addr); ?></span><br>
      <?php else : ?>
      <strong>Location:</strong> Huntsville, AL<br>
      <?php endif; ?>
"""
    new = """      <strong>Location:</strong> Huntsville, AL — Huntsville-area FFL<br>
"""
    if old not in text:
        raise SystemExit("footer: location block not found")
    text = text.replace(old, new, 1)
    text = text.replace(
        "Directions & contact form →",
        "Contact form →",
        1,
    )
    p.write_text(text, encoding="utf-8")
    print("footer.php: updated")


def patch_guide() -> None:
    p = THEME / "page-firearm-transfer-guide.php"
    backup(p)
    text = p.read_text(encoding="utf-8")
    text = text.replace(
        "<li>Order your firearm online and have it shipped to Modular Gunworks LLC (or another FFL of your choice).</li>",
        "<li>Contact Modular Gunworks for FFL shipping details (or choose another FFL), then order online and have it shipped only after we confirm.</li>",
        1,
    )
    text = text.replace(
        "<li>You come to our Huntsville location with a valid ID to complete the transfer and background check.</li>",
        "<li>We share pickup details when your firearm is ready — bring a valid ID to complete the transfer and background check.</li>",
        1,
    )
    p.write_text(text, encoding="utf-8")
    print("page-firearm-transfer-guide.php: updated")


def patch_schema_faq() -> None:
    p = THEME / "inc" / "store-info.php"
    backup(p)
    text = p.read_text(encoding="utf-8")
    old = (
        "When you checkout with an online retailer, choose an FFL transfer and enter our business name and address "
        "(shown on our Contact page and FFL transfers page). We will match the shipment to your order when it arrives."
    )
    new = (
        "Contact us first to request a transfer. We provide our FFL shipping details to you or your seller. "
        "Then check out with an FFL transfer to Modular Gunworks LLC. We match the shipment when it arrives."
    )
    if old not in text:
        raise SystemExit("store-info FAQ not found")
    p.write_text(text.replace(old, new, 1), encoding="utf-8")
    print("inc/store-info.php: FAQ schema updated")


if __name__ == "__main__":
    patch_ffl()
    patch_contact()
    patch_footer()
    patch_guide()
    patch_schema_faq()
    # Purge Breeze file cache if present
    cache = Path("/opt/bitnami/wordpress/wp-content/cache/breeze")
    if cache.is_dir():
        import shutil

        for child in cache.iterdir():
            if child.is_dir():
                shutil.rmtree(child, ignore_errors=True)
            else:
                child.unlink(missing_ok=True)
        print("breeze cache cleared")
    print("done")
