#!/bin/sh
set -e
ROOT=/opt/market-desk-v2
cd "$ROOT"
cp -r .next/static .next/standalone/.next/static
mkdir -p .next/standalone/data
# Keep DB on persistent host path (also mounted via DATABASE_URL in systemd).
ln -sf "$ROOT/data/desk.db" .next/standalone/data/desk.db 2>/dev/null || true
echo "Standalone bundle ready."
