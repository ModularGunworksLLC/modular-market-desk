#!/bin/sh
set -e
ROOT=/opt/market-desk-v2
cd "$ROOT"
cp -r .next/static .next/standalone/.next/static
mkdir -p .next/standalone/data
mkdir -p "$ROOT/data/trade-in"
# Keep DB + trade-in photos on persistent host path.
ln -sf "$ROOT/data/desk.db" .next/standalone/data/desk.db 2>/dev/null || true
rm -rf .next/standalone/data/trade-in
ln -sfn "$ROOT/data/trade-in" .next/standalone/data/trade-in
echo "Standalone bundle ready."
