#!/usr/bin/env bash
# Enable desk + API Apache vhosts on Bitnami (ledger vhosts untouched).
set -euo pipefail

APP_DIR="${MMD_APP_DIR:-/opt/modular-market-desk}"
VHOST_DIR="/opt/bitnami/apache/conf/vhosts"

if [[ ! -d "$APP_DIR/deploy" ]]; then
  echo "Missing $APP_DIR/deploy — clone modular-market-desk first."
  exit 1
fi

sudo cp "$APP_DIR/deploy/apache-mmd-api.conf.example" "$VHOST_DIR/mmd-api.conf"
sudo cp "$APP_DIR/deploy/apache-mmd-desk.conf.example" "$VHOST_DIR/mmd-desk.conf"
sudo /opt/bitnami/ctlscript.sh restart apache
echo "Enabled mmd-api.conf and mmd-desk.conf (ledger configs unchanged)."
echo "Issue TLS certs when DNS is live, e.g.:"
echo "  sudo /opt/bitnami/bncert-tool"
