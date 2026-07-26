#!/bin/bash
set -e
sudo /opt/bitnami/php/bin/php /tmp/wp-brands-logo-coverage.php
sudo /opt/bitnami/php/bin/php /tmp/purge-breeze.php
sudo /opt/bitnami/ctlscript.sh restart php-fpm >/dev/null
sleep 2
curl -sL 'https://www.modulargunworks.com/brands/?v=logos2' > /tmp/brands.html
echo "img_tags=$(grep -c 'assets/images/brands/' /tmp/brands.html || true)"
echo "placeholders=$(grep -c 'brand-logo-placeholder' /tmp/brands.html || true)"
grep -oE 'assets/images/brands/[^" ]+' /tmp/brands.html | sort | uniq | head -25
