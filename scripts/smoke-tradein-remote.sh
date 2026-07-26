#!/bin/bash
set -e
mkdir -p /opt/market-desk-v2/data/trade-in
ENVF=/opt/market-desk-v2/.env
grep -q '^TRADE_IN_STORAGE_DIR=' "$ENVF" || echo 'TRADE_IN_STORAGE_DIR=/opt/market-desk-v2/data/trade-in' >> "$ENVF"
grep -q '^PUBLIC_DESK_URL=' "$ENVF" || echo 'PUBLIC_DESK_URL=https://desk.modulargunworks.com' >> "$ENVF"
echo "env keys:"
grep -E '^(TRADE_IN_|PUBLIC_DESK|SMTP_|NOTIFY_)' "$ENVF" | sed 's/=.*/***/' || true
echo "standalone data:"
ls -la /opt/market-desk-v2/.next/standalone/data/ || true
sudo systemctl restart market-desk
sleep 2
echo "estimate:"
curl -s -X POST https://desk.modulargunworks.com/api/trade-in/estimate \
  -H 'Content-Type: application/json' \
  -d '{"manufacturer":"Sig Sauer","model":"P320"}' | head -c 800
echo
echo "pages:"
curl -s -o /dev/null -w 'trade-in %{http_code}\n' https://desk.modulargunworks.com/trade-in
curl -s -o /dev/null -w 'inbox %{http_code}\n' https://desk.modulargunworks.com/trade-in/inbox
curl -s https://www.modulargunworks.com/ | grep -o 'Sell us your firearm' | head -3 || echo 'CTA not on homepage HTML yet'
curl -s https://www.modulargunworks.com/services/ | grep -o 'Sell us your firearm' | head -3 || echo 'CTA not on services'
