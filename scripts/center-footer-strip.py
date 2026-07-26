#!/usr/bin/env python3
from pathlib import Path
import shutil

THEME = Path("/opt/bitnami/wordpress/wp-content/themes/modulargunworks")

footer = THEME / "footer.php"
ft = footer.read_text(encoding="utf-8")
old = """  <div class=\"footer-local-strip footer-wide\">
    <p><?php esc_html_e('Modular Gunworks LLC is a veteran-owned gun shop and licensed FFL in Huntsville, Alabama. We specialize in compliant FFL transfers for online buyers, in-store pickup, gunsmithing, and shipping lawful orders nationwide from our North Alabama operation.', 'modulargunworks'); ?></p>
    <div class=\"footer-local-quicklinks\">
"""
new = """  <div class=\"footer-local-strip footer-wide\">
    <p class=\"footer-local-lead\"><?php esc_html_e('Modular Gunworks LLC is a veteran-owned gun shop and licensed FFL in Huntsville, Alabama.', 'modulargunworks'); ?></p>
    <p class=\"footer-local-sub\"><?php esc_html_e('FFL transfers, pickup, gunsmithing, and lawful shipping nationwide.', 'modulargunworks'); ?></p>
    <div class=\"footer-local-quicklinks\">
"""
if old not in ft:
    raise SystemExit("footer strip not found")
footer.write_text(ft.replace(old, new, 1), encoding="utf-8")
print("footer.php: blurb shortened")

layout = THEME / "assets" / "css" / "layout.css"
css = layout.read_text(encoding="utf-8")
old_css = """/* Local SEO blurb: same tone as footer columns (no separate “card” color) */
.footer-local-strip {
  max-width: 1400px;
  margin: 0 auto 1.5rem;
  padding: 0 0 1rem;
  border-bottom: 1px solid rgba(255,255,255,0.08);
}

.footer-local-strip p {
  margin: 0 0 0.85rem;
  color: #ccc;
  font-size: 0.9rem;
  line-height: 1.8;
}

.footer-local-quicklinks {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem 1.25rem;
  align-items: center;
}
"""
new_css = """/* Local SEO blurb: centered with copyright band */
.footer-local-strip {
  max-width: 900px;
  margin: 0 auto 1.5rem;
  padding: 0 1rem 1rem;
  border-bottom: 1px solid rgba(255,255,255,0.08);
  text-align: center;
}

.footer-local-strip p {
  margin: 0 0 0.45rem;
  color: #ccc;
  font-size: 0.9rem;
  line-height: 1.55;
}

.footer-local-strip .footer-local-sub {
  margin-bottom: 0.95rem;
  color: #aaa;
  font-size: 0.88rem;
}

.footer-local-quicklinks {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem 1.5rem;
  align-items: center;
  justify-content: center;
}
"""
if old_css not in css:
    raise SystemExit("layout css block not found")
layout.write_text(css.replace(old_css, new_css, 1), encoding="utf-8")
print("layout.css: strip centered")

fn = THEME / "functions.php"
fnt = fn.read_text(encoding="utf-8")
fnt2 = fnt.replace("'1.0.13'", "'1.0.14'").replace(
    "array( 'mgw-components' ), '1.0.12' );",
    "array( 'mgw-components' ), '1.0.14' );",
)
# Only bump layout version specifically
fnt = fn.read_text(encoding="utf-8")
import re
fnt2, n = re.subn(
    r"(mgw-layout.*?),\s*'1\.0\.\d+'\s*\);",
    r"\1, '1.0.14' );",
    fnt,
    count=1,
)
if n != 1:
    print("warn: version bump count", n)
else:
    fn.write_text(fnt2, encoding="utf-8")
    print("functions.php: layout 1.0.14")

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
print("cache cleared")
