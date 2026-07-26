#!/bin/bash
set -e
ENVF=/opt/market-desk-v2/.env

# Fix accidental join of TRADE_IN onto previous line (no newline)
python3 - <<'PY'
from pathlib import Path
p = Path("/opt/market-desk-v2/.env")
text = p.read_text(encoding="utf-8", errors="replace")
bad = "WEB_COMPS_DRIP_MS=15000TRADE_IN_STORAGE_DIR=/opt/market-desk-v2/data/trade-in"
if bad in text:
    text = text.replace(
        bad,
        "WEB_COMPS_DRIP_MS=15000\nTRADE_IN_STORAGE_DIR=/opt/market-desk-v2/data/trade-in",
    )
    p.write_text(text, encoding="utf-8")
    print("fixed joined TRADE_IN_STORAGE_DIR line")
else:
    print("no joined line")

lines = p.read_text(encoding="utf-8").splitlines()
keys = {ln.split("=", 1)[0] for ln in lines if "=" in ln and not ln.strip().startswith("#")}
extras = []
if "TRADE_IN_STORAGE_DIR" not in keys:
    extras.append("TRADE_IN_STORAGE_DIR=/opt/market-desk-v2/data/trade-in")
if "PUBLIC_DESK_URL" not in keys:
    extras.append("PUBLIC_DESK_URL=https://desk.modulargunworks.com")
if extras:
    with p.open("a", encoding="utf-8") as f:
        f.write("\n" + "\n".join(extras) + "\n")
    print("appended", extras)
print("relevant keys:")
for ln in p.read_text(encoding="utf-8").splitlines():
    if ln.startswith(("TRADE_IN_", "PUBLIC_DESK", "SMTP_", "NOTIFY_", "WEB_COMPS_DRIP")):
        print(ln.split("=", 1)[0] + "=***")
PY

sudo systemctl restart market-desk
sleep 2

printf '%s\n' '{"manufacturer":"Glock","model":"19"}' > /tmp/est.json
curl -s -X POST https://desk.modulargunworks.com/api/trade-in/estimate \
  -H 'Content-Type: application/json' \
  --data-binary @/tmp/est.json
echo

wp theme list --path=/opt/bitnami/wordpress --status=active 2>/dev/null || \
  sudo -u bitnami /opt/bitnami/wordpress/wp theme list --path=/opt/bitnami/wordpress --status=active 2>/dev/null || \
  php -r 'include "/opt/bitnami/wordpress/wp-load.php"; echo wp_get_theme()->get_stylesheet(), "\n";'

curl -sL 'https://modulargunworks.com/' | grep -o 'Sell us your firearm' | head -3 || echo 'homepage CTA missing in HTML'
curl -sL 'https://modulargunworks.com/services/' | grep -o 'Sell us your firearm' | head -3 || echo 'services CTA missing in HTML'
