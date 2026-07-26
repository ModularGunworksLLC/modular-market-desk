#!/bin/bash
set -e
sudo python3 /tmp/patch-brands-logo-sort.py
sudo /opt/bitnami/php/bin/php /tmp/purge-breeze.php
sudo /opt/bitnami/ctlscript.sh restart php-fpm >/dev/null
sleep 2
curl -sL 'https://www.modulargunworks.com/brands/?v=sort2' > /tmp/brands-sort.html
python3 - <<'PY'
import re
html = open("/tmp/brands-sort.html", encoding="utf-8", errors="replace").read()
names = re.findall(r"<h3>(.*?)</h3>", html)
print("first15:")
for n in names[:15]:
    print(" ", n)
# count how many leading cards have img vs placeholder before first placeholder-only stretch
imgs = 0
for m in re.finditer(r'class="brand-card">(.*?)</a>', html, re.S):
    block = m.group(1)
    if "brand-logo-placeholder" in block:
        break
    if "<img " in block:
        imgs += 1
print(f"leading_logo_cards={imgs}")
PY
