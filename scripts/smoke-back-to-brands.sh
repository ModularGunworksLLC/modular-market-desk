#!/bin/bash
set -e
sudo python3 /tmp/add-back-to-brands.py
sudo rm -rf /opt/bitnami/wordpress/wp-content/cache/breeze/* /opt/bitnami/wordpress/wp-content/cache/breeze-minification/* || true
sudo /opt/bitnami/php/bin/php /tmp/purge-breeze.php
sudo /opt/bitnami/ctlscript.sh restart php-fpm >/dev/null
sleep 2
curl -sL 'https://www.modulargunworks.com/shop/?pa_brand=sig-sauer&v=back1' -o /tmp/sig-back.html
python3 - <<'PY'
import re
html=open('/tmp/sig-back.html',encoding='utf-8',errors='replace').read()
print('has_all_brands', 'All brands' in html)
print('has_class', 'mgw-back-to-brands' in html)
# breadcrumb crumbs text
for m in re.findall(r'woocommerce-breadcrumb.*?>(.*?)</nav>', html, re.S|re.I)[:1]:
    text=re.sub('<[^>]+>',' ',m)
    text=re.sub(r'\s+',' ',text).strip()
    print('breadcrumb:', text[:160])
href=re.search(r'mgw-back-to-brands.*?href="([^"]+)"', html, re.S)
print('href', href.group(1) if href else None)
PY
