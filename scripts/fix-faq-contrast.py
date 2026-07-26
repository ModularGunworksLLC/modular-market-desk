#!/usr/bin/env python3
from pathlib import Path
import re
import shutil

THEME = Path("/opt/bitnami/wordpress/wp-content/themes/modulargunworks")

# 1) Stop painting every <button> white-on-red
comp = THEME / "assets" / "css" / "components.css"
ct = comp.read_text(encoding="utf-8")
ct2 = ct.replace(
    ".button, button, input[type=\"submit\"] {",
    ".button, input[type=\"submit\"] {",
).replace(
    ".button:hover, button:hover, input[type=\"submit\"]:hover {",
    ".button:hover, input[type=\"submit\"]:hover {",
)
if ct2 == ct:
    raise SystemExit("components.css button selectors not found")
comp.write_text(ct2, encoding="utf-8")
print("components.css: narrowed button CTA selector")

# 2) FAQ contrast + readable accordion styles
faq = THEME / "page-faq.php"
ft = faq.read_text(encoding="utf-8")
old_style = """<style>
.faq-page .page-intro{margin-bottom:2rem;color:#666;}
.faq-category{margin-bottom:2rem;}.faq-category-title{font-size:1.25rem;margin-bottom:1rem;}
.faq-item{background:#fff;border:1px solid #e0e0e0;border-radius:8px;margin-bottom:.75rem;overflow:hidden;}
.faq-question{width:100%;padding:1rem 1.25rem;background:#f9f9f9;border:none;cursor:pointer;font-weight:600;text-align:left;display:flex;justify-content:space-between;align-items:center;}
.faq-question:hover{background:#f0f0f0;}
.faq-question i{transition:transform .3s;}
.faq-item.active .faq-question i{transform:rotate(180deg);}
.faq-answer{display:none;padding:1rem 1.25rem;color:#666;line-height:1.6;border-top:1px solid #e0e0e0;}
.faq-item.active .faq-answer{display:block;}
</style>
"""
new_style = """<style>
.faq-page{max-width:820px;margin:0 auto;padding:0 1.25rem 2.5rem;}
.faq-page .page-title{text-align:left;}
.faq-page .page-intro{margin-bottom:2rem;color:#555;}
.faq-category{margin-bottom:2rem;}
.faq-category-title{font-size:1.25rem;margin-bottom:1rem;color:#181a1b;}
.faq-item{background:#fff;border:1px solid #d8d8d8;border-radius:8px;margin-bottom:.75rem;overflow:hidden;}
.faq-question{
  width:100%;
  padding:1rem 1.25rem;
  background:#f3f4f5;
  border:none;
  border-radius:0;
  box-shadow:none;
  cursor:pointer;
  font-family:var(--font-body), Arial, sans-serif;
  font-size:1rem;
  font-weight:600;
  color:#181a1b;
  text-align:left;
  text-transform:none;
  letter-spacing:normal;
  display:flex;
  justify-content:space-between;
  align-items:center;
  gap:1rem;
}
.faq-question span{color:#181a1b;}
.faq-question i{color:#555;transition:transform .3s;flex-shrink:0;}
.faq-question:hover{background:#e9ebed;color:#181a1b;}
.faq-item.active .faq-question{background:#eceef0;}
.faq-item.active .faq-question i{transform:rotate(180deg);}
.faq-answer{display:none;padding:1rem 1.25rem;background:#fff;color:#333;line-height:1.6;border-top:1px solid #d8d8d8;}
.faq-answer p{margin:0;color:#333;}
.faq-answer a{color:var(--color-primary);font-weight:600;}
.faq-item.active .faq-answer{display:block;}
</style>
"""
if old_style not in ft:
    raise SystemExit("faq style block not found")
faq.write_text(ft.replace(old_style, new_style, 1), encoding="utf-8")
print("page-faq.php: contrast fixed")

# bump components version
fn = THEME / "functions.php"
fnt = fn.read_text(encoding="utf-8")
fnt2, n = re.subn(
    r"(mgw-components.*?),\s*'1\.0\.\d+'\s*\);",
    r"\1, '1.0.1' );",
    fnt,
    count=1,
)
if n != 1:
    print("warn: components version bump", n)
else:
    fn.write_text(fnt2, encoding="utf-8")
    print("components.css version 1.0.1")

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
