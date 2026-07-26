#!/usr/bin/env python3
"""Idempotent WP theme patch: Sell us your firearm -> desk /trade-in."""

from pathlib import Path

THEME = Path("/opt/bitnami/wordpress/wp-content/themes/modulargunworks")
TRADE_IN = "https://desk.modulargunworks.com/trade-in"


def patch_front() -> None:
    p = THEME / "front-page.php"
    text = p.read_text(encoding="utf-8")
    if TRADE_IN in text:
        print("front-page: already present")
        return
    needle = (
        "      <a href=\"<?php echo esc_url($shop_url); ?>\" class=\"hero-cta-btn secondary\">"
        "<?php esc_html_e('Shop online catalog', 'modulargunworks'); ?></a>\n"
    )
    insert = (
        needle
        + f'      <a href="{TRADE_IN}" class="hero-cta-btn secondary">'
        "<?php esc_html_e('Sell us your firearm', 'modulargunworks'); ?></a>\n"
    )
    if needle not in text:
        raise SystemExit("front-page needle not found")
    p.write_text(text.replace(needle, insert, 1), encoding="utf-8")
    print("front-page: CTA added")


def patch_services() -> None:
    p = THEME / "page-services.php"
    text = p.read_text(encoding="utf-8")
    if TRADE_IN in text:
        print("page-services: already present")
        return
    needle = (
        '    <div class="service-card">\n'
        '      <h2><i class="fas fa-file-alt"></i> FFL Transfers</h2>\n'
        "      <p>We are a licensed FFL and offer professional transfer services for firearms "
        "purchased online or from out-of-state sellers. We handle the compliance paperwork so "
        "your firearms are transferred legally and safely.</p>\n"
        "      <a href=\"<?php echo esc_url(home_url('/ffl-transfers')); ?>\" "
        'class="service-cta">Transfer info &amp; fees</a>\n'
        "    </div>\n"
    )
    card = (
        needle
        + '    <div class="service-card">\n'
        '      <h2><i class="fas fa-hand-holding-usd"></i> Sell / Trade-In</h2>\n'
        "      <p>Thinking of selling or trading a firearm? Get a soft market estimate and "
        "submit photos online — we review every request in person before making an offer.</p>\n"
        f'      <a href="{TRADE_IN}" class="service-cta" rel="noopener">Sell us your firearm</a>\n'
        "    </div>\n"
    )
    if needle not in text:
        raise SystemExit("services needle not found")
    p.write_text(text.replace(needle, card, 1), encoding="utf-8")
    print("page-services: card added")


if __name__ == "__main__":
    patch_front()
    patch_services()
