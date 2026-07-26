#!/bin/bash
set -e
sudo python3 /tmp/fix-brand-clickthrough.py
sudo /opt/bitnami/php/bin/php /tmp/purge-breeze.php
sudo /opt/bitnami/ctlscript.sh restart php-fpm >/dev/null
sleep 2
# Brands page should link to shop?pa_brand=
curl -sL 'https://www.modulargunworks.com/brands/?v=clickfix1' | grep -oE 'href="[^"]*pa_brand=[^"]+"' | head -8
echo '==== click-through ===='
url=$(curl -sL 'https://www.modulargunworks.com/brands/?v=clickfix1' | grep -oE 'href="[^"]*pa_brand=sig-sauer[^"]*"' | head -1 | sed 's/href="//;s/"$//')
echo "sig_url=$url"
curl -sL "$url" -o /tmp/sig-shop.html
python3 - <<'PY'
import re
html=open('/tmp/sig-shop.html',encoding='utf-8',errors='replace').read()
print('products', len(re.findall(r'woocommerce-loop-product__title', html)))
print('none', 'no products were found' in html.lower())
titles=re.findall(r'woocommerce-loop-product__title[^>]*>\s*([^<]+)', html)
print('sample', titles[:3])
PY
