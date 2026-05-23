"""One-off inspect TrueGunValue page text."""
from __future__ import annotations

import re
import sys

from bs4 import BeautifulSoup

from mmd_engine.browser import browser_page, dismiss_age_gate

url = sys.argv[1] if len(sys.argv) > 1 else (
    "https://truegunvalue.com/pistol/Savage-Arms-Savage-1911-45-ACP/price-historical-value"
)

with browser_page(headless=True) as page:
    page.goto(url, wait_until="domcontentloaded", timeout=90_000)
    dismiss_age_gate(page)
    page.wait_for_timeout(3_000)
    print("TITLE:", page.title())
    text = BeautifulSoup(page.content(), "html.parser").get_text("\n", strip=True)

for pat in [
    r"worth an average price of \$([\d,]+)",
    r"\$([\d,]+(?:\.\d{2})?) used",
    r"New Sold.{0,40}",
    r"Used Sold.{0,40}",
    r"None Currently For Sale",
    r"too little sold data",
]:
    m = re.search(pat, text, re.I)
    if m:
        print("MATCH:", m.group(0)[:100])

chunks = re.split(r"(?=PRICE:\s*\$)", text, flags=re.I)
print(f"\nSold blocks: {sum(1 for c in chunks if 'SOLD:' in c.upper())}")
for c in chunks[1:]:
    if "SOLD:" not in c.upper():
        continue
    price = re.search(r"PRICE:\s*\$([\d.]+)", c, re.I)
    cond = re.search(r"CONDITION:\s*([^\n]+)", c, re.I)
    upc = re.search(r"UPC:\s*([^\n]+)", c, re.I)
    mpn = re.search(r"MANF\. PART #:\s*([^\n]+)", c, re.I)
    sold = re.search(r"SOLD:\s*([^\n]+)", c, re.I)
    lines = [ln.strip() for ln in c.splitlines() if ln.strip()]
    tail = ""
    for ln in reversed(lines):
        up = ln.upper()
        if not any(up.startswith(p) for p in ("PRICE:", "MANUFACTURER:", "CONDITION:", "MODEL:", "SOLD:", "UPC:", "SKU:", "CALIBER:", "MANF", "CAPACITY:", "BARREL", "LOCATION:")):
            if len(ln) > 20:
                tail = ln[:75]
                break
    if price:
        print(
            f"  ${price.group(1)} | {cond.group(1).strip() if cond else ''} | "
            f"sold {sold.group(1).strip() if sold else ''} | "
            f"UPC {upc.group(1).strip() if upc else ''} | MPN {mpn.group(1).strip() if mpn else ''}"
        )
        if tail:
            print(f"    {tail}")
