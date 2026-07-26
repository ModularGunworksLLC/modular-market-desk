#!/usr/bin/env python3
from pathlib import Path

fn = Path("/opt/bitnami/wordpress/wp-content/themes/modulargunworks/functions.php")
text = fn.read_text(encoding="utf-8")
needle = "require_once $mgw_theme_inc;\n"
insert = """require_once $mgw_theme_inc;
$mgw_brand_logos = trailingslashit( get_template_directory() ) . 'inc/brand-logos.php';
if ( file_exists( $mgw_brand_logos ) ) {
	require_once $mgw_brand_logos;
}
"""
if "inc/brand-logos.php" in text:
    print("functions.php already includes brand-logos")
else:
    if needle not in text:
        raise SystemExit("needle not found")
    fn.write_text(text.replace(needle, insert, 1), encoding="utf-8")
    print("functions.php: brand-logos required")
