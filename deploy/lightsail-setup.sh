#!/usr/bin/env bash
# Modular Market Desk — Lightsail server setup (run on the instance via SSH)
set -euo pipefail

APP_DIR="${MMD_APP_DIR:-/opt/modular-market-desk}"
REPO_URL="${MMD_REPO_URL:-https://github.com/ModularGunworksLLC/modular-market-desk.git}"
DESK_ROOT="${MMD_DESK_ROOT:-/var/www/desk}"
API_DOMAIN="${MMD_API_DOMAIN:-api.modulargunworks.com}"
DESK_DOMAIN="${MMD_DESK_DOMAIN:-desk.modulargunworks.com}"

echo "=== Modular Market Desk — Lightsail setup ==="
echo "App dir: $APP_DIR"

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker not found. Install Docker first, then re-run this script."
  exit 1
fi

if ! docker compose version >/dev/null 2>&1; then
  echo "docker compose plugin not found."
  exit 1
fi

# Clone or update
if [[ -d "$APP_DIR/.git" ]]; then
  echo "Updating existing clone..."
  git -C "$APP_DIR" pull --ff-only
else
  echo "Cloning repository..."
  sudo mkdir -p "$APP_DIR"
  sudo chown "$USER:$USER" "$APP_DIR"
  git clone "$REPO_URL" "$APP_DIR"
fi

cd "$APP_DIR"

# Persistent data dirs
mkdir -p engine/data/sessions engine/data/valuation_cache engine/data/imports

# Secrets
if [[ ! -f engine/.env ]]; then
  cp engine/.env.example engine/.env
  echo ""
  echo "Created engine/.env — edit it now (MMD_API_KEY, wholesale creds), then re-run:"
  echo "  $0"
  exit 0
fi

# API
echo "Building and starting API container..."
docker compose build
docker compose up -d

echo "Waiting for API..."
for i in $(seq 1 30); do
  if curl -sf http://127.0.0.1:8000/health >/dev/null; then
    echo "API healthy."
    curl -s http://127.0.0.1:8000/health | head -c 500
    echo ""
    break
  fi
  sleep 2
done

# Desk UI (requires Node on server)
if command -v npm >/dev/null 2>&1; then
  echo "Building desk UI..."
  if [[ ! -f web/public/config.json ]] || grep -q localhost web/public/config.json 2>/dev/null; then
    if [[ -f web/public/config.production.example.json ]]; then
      cp web/public/config.production.example.json web/public/config.json
      echo "Copied web/public/config.production.example.json → config.json"
    fi
  fi
  cd web
  export VITE_BASE_PATH=/
  npm ci
  npm run build
  cd ..
  sudo mkdir -p "$DESK_ROOT"
  sudo cp -r web/dist/* "$DESK_ROOT/"
  echo "Desk static files deployed to $DESK_ROOT"
else
  echo "npm not installed — skip UI build. Install Node 20+ and re-run, or build web/ locally and scp dist/ to $DESK_ROOT"
fi

# Reverse proxy hints (Bitnami Apache or nginx — never touch ledger vhosts)
if [[ -d /opt/bitnami/apache/conf/vhosts ]]; then
  echo ""
  echo "=== Bitnami Apache (same stack as ledger) ==="
  echo "After DNS A records for $API_DOMAIN and $DESK_DOMAIN:"
  echo "  bash $APP_DIR/deploy/bitnami-apache-enable.sh"
  echo "  sudo /opt/bitnami/bncert-tool   # add api + desk hostnames"
elif command -v nginx >/dev/null 2>&1; then
  echo ""
  echo "=== nginx ==="
  echo "  sudo cp $APP_DIR/deploy/nginx-api.conf.example /etc/nginx/sites-available/mmd-api"
  echo "  sudo cp $APP_DIR/deploy/nginx-desk.conf.example /etc/nginx/sites-available/mmd-desk"
  echo "  sudo ln -sf /etc/nginx/sites-available/mmd-api /etc/nginx/sites-enabled/"
  echo "  sudo ln -sf /etc/nginx/sites-available/mmd-desk /etc/nginx/sites-enabled/"
  echo "  sudo nginx -t && sudo systemctl reload nginx"
  echo "  sudo certbot --nginx -d $API_DOMAIN -d $DESK_DOMAIN"
else
  echo "No Apache/nginx detected — see deploy/README-LIGHTSAIL.md"
fi

echo ""
echo "=== Done ==="
echo "Next: DNS A records for $API_DOMAIN and $DESK_DOMAIN → this server's static IP"
echo "Then: upload GunBroker session from your PC (scripts/push-sessions.ps1)"
