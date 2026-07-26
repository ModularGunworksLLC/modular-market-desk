#!/usr/bin/env python3
from pathlib import Path
import re
import shutil

THEME = Path("/opt/bitnami/wordpress/wp-content/themes/modulargunworks")

footer = THEME / "footer.php"
ft = footer.read_text(encoding="utf-8")
old = """    <div class="footer-section footer-contact">
      <h3>Contact</h3>
      <ul class="footer-contact-list">
        <li><span class="footer-contact-label">Phone</span> <a href="tel:+12563843852">(256) 384-3852</a></li>
        <li><span class="footer-contact-label">Email</span> <a href="mailto:info@modulargunworks.com">info@modulargunworks.com</a></li>
        <li><span class="footer-contact-label">Location</span> Huntsville, AL</li>
        <li><span class="footer-contact-label">Hours</span> <span class="footer-hours">Mon-Fri 9am-6pm, Sat 10am-4pm CT</span></li>
      </ul>
    </div>
"""
new = """    <div class="footer-section footer-contact">
      <h3>Contact</h3>
      <ul class="footer-contact-list">
        <li>
          <span class="footer-contact-label">Phone</span>
          <span class="footer-contact-value"><a href="tel:+12563843852">(256) 384-3852</a></span>
        </li>
        <li>
          <span class="footer-contact-label">Email</span>
          <span class="footer-contact-value"><a href="mailto:info@modulargunworks.com">info@modulargunworks.com</a></span>
        </li>
        <li>
          <span class="footer-contact-label">Location</span>
          <span class="footer-contact-value">Huntsville, AL</span>
        </li>
        <li>
          <span class="footer-contact-label">Hours</span>
          <span class="footer-contact-value">Mon-Fri 9am-6pm<br>Sat 10am-4pm CT</span>
        </li>
      </ul>
    </div>
"""
if old not in ft:
    raise SystemExit("footer contact block not found")
footer.write_text(ft.replace(old, new, 1), encoding="utf-8")
print("footer markup updated")

layout = THEME / "assets" / "css" / "layout.css"
css = layout.read_text(encoding="utf-8")
old_css = """/* footer-contact-list */
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
new_css = """/* footer-contact-list — stacked rows so every item matches */
.footer-contact-list {
  list-style: none;
  margin: 0;
  padding: 0;
}
.footer-contact-list li {
  display: block;
  margin: 0 0 0.85rem;
  line-height: 1.35;
  color: #c8c8c8;
}
.footer-contact-list li:last-child {
  margin-bottom: 0;
}
.footer-contact-label {
  display: block;
  margin: 0 0 0.2rem;
  font-weight: 700;
  font-size: 0.8rem;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  color: #fff;
}
.footer-contact-value {
  display: block;
  font-size: 0.92rem;
  color: #c8c8c8;
  word-break: break-word;
}
.footer-contact-value a {
  color: #c8c8c8;
  text-decoration: none;
}
.footer-contact-value a:hover {
  color: var(--color-primary);
}
"""
if old_css not in css:
    raise SystemExit("footer contact css not found")
layout.write_text(css.replace(old_css, new_css, 1), encoding="utf-8")
print("layout.css updated")

fn = THEME / "functions.php"
fnt = fn.read_text(encoding="utf-8")
fnt2, n = re.subn(
    r"(mgw-layout.*?),\s*'1\.0\.\d+'\s*\);",
    r"\1, '1.0.15' );",
    fnt,
    count=1,
)
if n != 1:
    raise SystemExit(f"version bump failed ({n})")
fn.write_text(fnt2, encoding="utf-8")
print("layout.css version 1.0.15")

for root in (
    "/opt/bitnami/wordpress/wp-content/cache/breeze",
    "/opt/bitnami/wordpress/wp-content/cache/breeze-minification",
):
    r = Path(root)
    if not r.is_dir():
        continue
    for c in list(r.iterdir()):
        if c.is_dir():
            shutil.rmtree(c, ignore_errors=True)
        else:
            try:
                c.unlink()
            except OSError:
                pass
print("cache cleared")
