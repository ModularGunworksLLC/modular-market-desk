#!/bin/bash
set -e
sudo /opt/bitnami/php/bin/php /tmp/diag-empty-brand-clicks.php
echo '==== page-brands source ===='
grep -n 'modulargunworks_get_brand_archive_url\|get_term_link\|pa_brand' /opt/bitnami/wordpress/wp-content/themes/modulargunworks/page-brands.php | head -20
echo '==== live hrefs ===='
curl -sL 'https://www.modulargunworks.com/brands/?v=now2' -o /tmp/brands-now.html
grep -oE 'href="[^"]+"' /tmp/brands-now.html | grep -E 'brand/|pa_brand=' | head -15
echo '==== aero shop filter ===='
curl -sL 'https://www.modulargunworks.com/shop/?pa_brand=aero-precision' -o /tmp/aero.html
python3 - <<'PY'
import re
html=open('/tmp/aero.html',encoding='utf-8',errors='replace').read()
print('products', len(re.findall('woocommerce-loop-product__title', html)))
print('none', 'no products were found' in html.lower())
PY
