#!/bin/bash
set -e
for u in \
  'https://www.modulargunworks.com/shop/?filter_brand=sig-sauer' \
  'https://www.modulargunworks.com/shop/?pa_brand=sig-sauer' \
  'https://www.modulargunworks.com/?post_type=product&pa_brand=sig-sauer' \
  'https://www.modulargunworks.com/shop/?query_type_brand=or&filter_brand=sig-sauer'
do
  curl -sL "$u" -o /tmp/b.html
  products=$(grep -c 'woocommerce-loop-product__title' /tmp/b.html || true)
  none=$(grep -ci 'no products were found' /tmp/b.html || true)
  title=$(python3 - <<'PY'
import re
html=open('/tmp/b.html',encoding='utf-8',errors='replace').read()
m=re.search(r'<title>(.*?)</title>',html,re.I|re.S)
print(re.sub(r'\s+',' ', m.group(1))[:80] if m else '')
PY
)
  echo "products=$products none=$none  $u"
  echo "  title=$title"
done
