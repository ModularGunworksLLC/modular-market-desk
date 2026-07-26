#!/bin/bash
set -e
sudo /opt/bitnami/php/bin/php /tmp/diag-brand-archive.php
echo '==== HTTP ===='
for u in \
  'https://www.modulargunworks.com/brand/aero-precision/' \
  'https://www.modulargunworks.com/product-category/brand/aero-precision/' \
  'https://www.modulargunworks.com/?pa_brand=aero-precision' \
  'https://www.modulargunworks.com/shop/?filter_brand=aero-precision'
do
  code=$(curl -sL -o /tmp/brand-page.html -w '%{http_code} final:%{url_effective}' "$u")
  echo "$code  $u"
done
echo '==== page snippet ===='
curl -sL 'https://www.modulargunworks.com/brand/aero-precision/' -o /tmp/brand-page.html
python3 - <<'PY'
from pathlib import Path
html = Path('/tmp/brand-page.html').read_text(encoding='utf-8', errors='replace')
print('title:', end=' ')
import re
m = re.search(r'<title>(.*?)</title>', html, re.I|re.S)
print(re.sub(r'\s+',' ', m.group(1)) if m else 'n/a')
for pat in ['no products were found', 'woocommerce-info', 'products found', 'ul class="products', 'Nothing found', '0 results', 'woocommerce-loop-product']:
    print(pat, html.lower().count(pat.lower()))
# first h1
h1 = re.search(r'<h1[^>]*>(.*?)</h1>', html, re.I|re.S)
print('h1:', re.sub('<[^>]+>','', h1.group(1)).strip() if h1 else 'n/a')
PY
echo '==== templates ===='
ls -la /opt/bitnami/wordpress/wp-content/themes/modulargunworks/taxonomy-pa_brand.php \
  /opt/bitnami/wordpress/wp-content/themes/modulargunworks/woocommerce/taxonomy-pa_brand.php 2>&1 | head
