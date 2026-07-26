#!/usr/bin/env python3
from pathlib import Path
import shutil

THEME = Path("/opt/bitnami/wordpress/wp-content/themes/modulargunworks")

# Move footer-contact CSS into the CSS that actually loads
layout = THEME / "assets" / "css" / "layout.css"
css = layout.read_text(encoding="utf-8")
marker = "/* footer-contact-list */"
block = """
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
  white-space: nowrap;
}
"""
if marker not in css:
    layout.write_text(css.rstrip() + "\n" + block, encoding="utf-8")
    print("layout.css: styles added")
else:
    print("layout.css: already present")

# Bump layout.css version so browsers/CDN pick it up
fn = THEME / "functions.php"
ft = fn.read_text(encoding="utf-8")
ft2 = ft.replace(
    "array( 'mgw-components' ), '1.0.12' );",
    "array( 'mgw-components' ), '1.0.13' );",
)
if ft2 == ft:
    # try already bumped
    print("functions.php: version string not found or already updated")
else:
    fn.write_text(ft2, encoding="utf-8")
    print("functions.php: layout.css -> 1.0.13")

# Strip orphan CSS from unused style.css (keep theme header only)
style = THEME / "style.css"
st = style.read_text(encoding="utf-8")
if marker in st:
    st = st.split(marker)[0].rstrip() + "\n"
    style.write_text(st, encoding="utf-8")
    print("style.css: removed unused footer rules")

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
print("disk cache cleared")
