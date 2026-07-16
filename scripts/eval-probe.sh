#!/bin/sh
# Quick live evaluate probe — run on Lightsail: bash scripts/eval-probe.sh
set -e
BASE="${1:-http://127.0.0.1:3010}"
probe() {
  label="$1"
  body="$2"
  echo "=== $label ==="
  curl -s -m 300 -X POST "$BASE/api/evaluate" -H "Content-Type: application/json" -d "$body" \
    | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const j=JSON.parse(d);console.log(JSON.stringify({gba:j.sourceStatus?.gba,error:j.error,sold:j.result?.sold?.count,asking:j.asking?.count,match:j.catalogMatch},null,2));});"
  echo ""
}
echo "Vault:"
curl -s "$BASE/api/vault/status"
echo ""
probe "SD9 VE" '{"manufacturer":"Smith & Wesson","model":"SD9 VE","caliber":"9mm","category":"handgun","condition":"any","targetAcquisitionCost":150,"autoComps":true,"targetProfit":50}'
probe "SD9VE no space" '{"manufacturer":"Smith & Wesson","model":"SD9VE","caliber":"9mm","category":"handgun","condition":"new","targetAcquisitionCost":150,"autoComps":true,"targetProfit":50}'
probe "SD VE" '{"manufacturer":"Smith & Wesson","model":"SD VE","caliber":"9mm","category":"handgun","condition":"any","targetAcquisitionCost":150,"autoComps":true,"targetProfit":50}'
probe "Revolution Armory" '{"manufacturer":"Revolution Armory","model":"AT-12","caliber":"12 Gauge","category":"shotgun","condition":"any","targetAcquisitionCost":200,"autoComps":true,"targetProfit":50}'
probe "M&P45 used" '{"manufacturer":"Smith & Wesson","model":"M&P45","caliber":".45 ACP","category":"handgun","condition":"used","targetAcquisitionCost":300,"autoComps":true,"targetProfit":50}'
probe "M&P 45" '{"manufacturer":"Smith & Wesson","model":"M&P 45","caliber":".45 ACP","category":"handgun","condition":"used","targetAcquisitionCost":300,"autoComps":true,"targetProfit":50}'
probe "M&P45 condition new" '{"manufacturer":"Smith & Wesson","model":"M&P45","caliber":".45 ACP","category":"handgun","condition":"new","targetAcquisitionCost":300,"autoComps":true,"targetProfit":50}'
probe "M&P45 45 ACP no dot" '{"manufacturer":"Smith & Wesson","model":"M&P45","caliber":"45 ACP","category":"handgun","condition":"used","targetAcquisitionCost":300,"autoComps":true,"targetProfit":50}'
