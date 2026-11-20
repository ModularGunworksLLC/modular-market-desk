#!/bin/bash
set -u
LEGO=/opt/bitnami/letsencrypt/lego
PATH_LE=/opt/bitnami/letsencrypt
WEBROOT=/opt/bitnami/apps/letsencrypt
LOG=/var/log/bitnami-letsencrypt-renew.log
exec >> "$LOG" 2>&1
echo "[$(date -u)] Starting lego renew"
status=0

renew_cert() {
  local email="$1"
  shift
  if ! "$LEGO" --path "$PATH_LE" --email "$email" --http --http.webroot "$WEBROOT" --accept-tos "$@" renew --no-random-sleep; then
    echo "[$(date -u)] FAILED: $*"
    status=1
  fi
}

renew_cert modulargunworks@gmail.com --domains ledger.modulargunworks.com
renew_cert modulargunworks@gmail.com --domains modulargunworks.com --domains www.modulargunworks.com
renew_cert michael@modulargunworks.com --domains api.modulargunworks.com --domains desk.modulargunworks.com

echo "[$(date -u)] Renew complete; restarting Apache"
/opt/bitnami/ctlscript.sh restart apache
echo "[$(date -u)] Done"
exit "$status"
