#!/usr/bin/env python3
"""Clean footer Contact block + matching contact page location line."""

from pathlib import Path

THEME = Path("/opt/bitnami/wordpress/wp-content/themes/modulargunworks")


def patch_footer() -> None:
    p = THEME / "footer.php"
    text = p.read_text(encoding="utf-8")
    old = """    <div class="footer-section">
      <h3>Contact</h3>
      <p><strong>Phone:</strong> <a href="tel:+12563843852">(256) 384-3852</a><br>
      <strong>Email:</strong> <a href="mailto:info@modulargunworks.com">info@modulargunworks.com</a><br>
      <strong>Location:</strong> Huntsville, AL (Huntsville-area FFL)<br>
      <strong>Hours:</strong> M-F 9AM-6PM, Sat 10AM-4PM CT</p>
      <p><a href="<?php echo esc_url(home_url('/contact')); ?>"><?php esc_html_e('Contact form →', 'modulargunworks'); ?></a></p>
    </div>
"""
    new = """    <div class="footer-section footer-contact">
      <h3>Contact</h3>
      <ul class="footer-contact-list">
        <li><span class="footer-contact-label">Phone</span> <a href="tel:+12563843852">(256) 384-3852</a></li>
        <li><span class="footer-contact-label">Email</span> <a href="mailto:info@modulargunworks.com">info@modulargunworks.com</a></li>
        <li><span class="footer-contact-label">Location</span> Huntsville, AL</li>
        <li><span class="footer-contact-label">Hours</span> <span class="footer-hours">Mon-Fri 9am-6pm, Sat 10am-4pm CT</span></li>
      </ul>
    </div>
"""
    if old not in text:
        raise SystemExit("footer contact block not found")
    bak = p.with_suffix(".php.bak-footer-contact")
    if not bak.exists():
        bak.write_text(text, encoding="utf-8")
    p.write_text(text.replace(old, new, 1), encoding="utf-8")
    print("footer.php: contact cleaned")


def patch_contact() -> None:
    p = THEME / "page-contact.php"
    text = p.read_text(encoding="utf-8")
    old = """          <p class="contact-address-block"><?php esc_html_e( 'Huntsville, AL (Huntsville-area FFL)', 'modulargunworks' ); ?></p>
          <p class="contact-address-note"><?php esc_html_e( 'Full shipping address provided when you arrange a transfer.', 'modulargunworks' ); ?></p>
          <p><strong><?php esc_html_e( 'Hours:', 'modulargunworks' ); ?></strong> <?php esc_html_e( 'M-F 9AM-6PM, Sat 10AM-4PM CT', 'modulargunworks' ); ?></p>
"""
    # After emdash strip it might be parentheses version
    if old not in text:
        old = """          <p class="contact-address-block"><?php esc_html_e( 'Huntsville, AL — Huntsville-area FFL', 'modulargunworks' ); ?></p>
          <p class="contact-address-note"><?php esc_html_e( 'Full shipping address provided when you arrange a transfer.', 'modulargunworks' ); ?></p>
          <p><strong><?php esc_html_e( 'Hours:', 'modulargunworks' ); ?></strong> <?php esc_html_e( 'M-F 9AM-6PM, Sat 10AM-4PM CT', 'modulargunworks' ); ?></p>
"""
    new = """          <p class="contact-address-block"><?php esc_html_e( 'Huntsville, AL', 'modulargunworks' ); ?></p>
          <p class="contact-address-note"><?php esc_html_e( 'Huntsville-area FFL. Shipping address provided when you arrange a transfer.', 'modulargunworks' ); ?></p>
          <p><strong><?php esc_html_e( 'Hours:', 'modulargunworks' ); ?></strong> <?php esc_html_e( 'Mon-Fri 9am-6pm, Sat 10am-4pm CT', 'modulargunworks' ); ?></p>
"""
    if old not in text:
        # show nearby for debug
        idx = text.find("contact-address-block")
        raise SystemExit("contact location block not found near: " + repr(text[idx : idx + 280]))
    bak = p.with_suffix(".php.bak-footer-contact")
    if not bak.exists():
        bak.write_text(text, encoding="utf-8")
    p.write_text(text.replace(old, new, 1), encoding="utf-8")
    print("page-contact.php: location cleaned")


def patch_ffl_hours() -> None:
    p = THEME / "page-ffl-transfers.php"
    text = p.read_text(encoding="utf-8")
    text2 = text.replace(
        "Hours: M-F 9–6, Sat 10–4 CT",
        "Hours: Mon-Fri 9am-6pm, Sat 10am-4pm CT",
    ).replace(
        "Hours: M-F 9-6, Sat 10-4 CT",
        "Hours: Mon-Fri 9am-6pm, Sat 10am-4pm CT",
    )
    # Also the nap line if still awkward
    text2 = text2.replace(
        "Huntsville, AL. Contact us for FFL shipping details.",
        "Huntsville, AL. Contact us for FFL shipping details.",
    )
    if text2 != text:
        p.write_text(text2, encoding="utf-8")
        print("page-ffl-transfers.php: hours normalized")


def patch_css() -> None:
    css = THEME / "style.css"
    text = css.read_text(encoding="utf-8")
    marker = "/* footer-contact-list */"
    if marker in text:
        print("style.css: already has footer-contact rules")
        return
    extra = """
/* footer-contact-list */
.footer-contact-list {
  list-style: none;
  margin: 0;
  padding: 0;
}
.footer-contact-list li {
  margin: 0 0 0.55rem;
  line-height: 1.45;
  color: #c8c8c8;
}
.footer-contact-label {
  display: inline-block;
  min-width: 4.75rem;
  font-weight: 700;
  color: #fff;
}
.footer-hours {
  white-space: normal;
}
@media (min-width: 480px) {
  .footer-hours {
    white-space: nowrap;
  }
}
"""
    css.write_text(text.rstrip() + "\n" + extra, encoding="utf-8")
    print("style.css: footer contact styles added")


def purge_cache() -> None:
    import shutil

    for root in (
        "/opt/bitnami/wordpress/wp-content/cache/breeze",
        "/opt/bitnami/wordpress/wp-content/cache/breeze-minification",
    ):
        r = Path(root)
        if not r.is_dir():
            continue
        for c in r.iterdir():
            if c.is_dir():
                shutil.rmtree(c, ignore_errors=True)
            else:
                c.unlink(missing_ok=True)
    print("cache cleared")


if __name__ == "__main__":
    patch_footer()
    patch_contact()
    patch_ffl_hours()
    patch_css()
    purge_cache()
