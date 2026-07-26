#!/usr/bin/env python3
from pathlib import Path
p = Path("/opt/bitnami/wordpress/wp-content/themes/modulargunworks/page-brands.php")
t = p.read_text(encoding="utf-8")
t2 = t.replace("'hide_empty' => false", "'hide_empty' => true")
if t2 == t:
    # already true or different formatting
    t2 = t.replace("'hide_empty' => false,", "'hide_empty' => true,")
p.write_text(t2, encoding="utf-8")
print("hide_empty set; contains true?", "hide_empty' => true" in t2)
