"""Parse Chattanooga DF5 Summer Dealer PDF extract for flip scoring."""
import re
from pathlib import Path

PDF = Path(r"c:\Users\micha\Downloads\2026_DF5-SummerDealer.pdf")
OUT = Path(__file__).parent / "df5-summer-extract.txt"

def fvf(g: float) -> float:
    c = min(g, 15000)
    return round((0.06 * min(c, 400) + 0.04 * max(0, c - 400)) * 100) / 100

def profit(list_price: float, cost: float) -> float:
    return round((list_price - fvf(list_price) - 8 - cost) * 100) / 100

# GB floor estimates for velocity lane (buyer pays ship, list = floor - 40)
FLOORS = [
    (re.compile(r"APX.*CARRY|APX A1 CARRY", re.I), 379, "APX Carry"),
    (re.compile(r"P320.*CMPCT|320C-9-BSS|P320 COMPACT", re.I), 489, "P320 Compact NSS"),
    (re.compile(r"G19|GLOCK.*19", re.I), 549, "Glock 19"),
    (re.compile(r"G17|GLOCK.*17", re.I), 549, "Glock 17"),
    (re.compile(r"SHIELD X|SHIELD.*EZ", re.I), 449, "Shield EZ/X"),
    (re.compile(r"BODYGUARD.*2\.0|BODYGUARD 2", re.I), 399, "Bodyguard 2.0"),
    (re.compile(r"HELLCAT", re.I), 549, "Hellcat"),
    (re.compile(r"ECHELON", re.I), 599, "Echelon"),
    (re.compile(r"VP9", re.I), 879, "HK VP9"),
    (re.compile(r"CANIK|METE|TP9", re.I), 399, "Canik"),
    (re.compile(r"WRANGLER", re.I), 249, "Wrangler"),
    (re.compile(r"HERITAGE.*22|ROUGH RIDER", re.I), 199, "Heritage RR"),
    (re.compile(r"PPK", re.I), 799, "Walther PPK"),
    (re.compile(r"P365", re.I), 599, "P365"),
    (re.compile(r"M&P.*9|M&P9", re.I), 549, "M&P9"),
    (re.compile(r"GX2|TAURUS G3", re.I), 349, "Taurus GX2/G3"),
    (re.compile(r"RUGER-57|57 GOLD", re.I), 549, "Ruger 57"),
    (re.compile(r"SR22", re.I), 449, "Ruger SR22"),
]

def main() -> None:
    from pypdf import PdfReader

    reader = PdfReader(str(PDF))
    text = "\n".join((p.extract_text() or "") for p in reader.pages)
    OUT.write_text(text, encoding="utf-8", errors="replace")
    print(f"Extracted {len(reader.pages)} pages, {len(text)} chars -> {OUT}")

    # DF5 SKU blocks: price often follows ONLY
    blocks = re.split(r"(?=DF5[A-Z0-9]+)", text)
    rows = []
    for block in blocks:
        m_sku = re.match(r"(DF5[A-Z0-9]+)", block)
        if not m_sku:
            continue
        sku = m_sku.group(1)
        prices = re.findall(r"ONLY\s*\n?\s*\$?([\d,]+\.\d{2})", block)
        if not prices:
            prices = re.findall(r"\$([\d,]+\.\d{2})", block)
        if not prices:
            continue
        # take last ONLY price in block (avoid strikethrough MSRP noise)
        price = float(prices[-1].replace(",", ""))
        snippet = re.sub(r"\s+", " ", block[:400]).strip()
        rows.append((sku, price, snippet))

    print(f"\nFound {len(rows)} DF5 SKUs with prices\n")

    scored = []
    for sku, dealer, snippet in rows:
        cost = dealer + 15
        hit = None
        for pat, floor, tag in FLOORS:
            if pat.search(snippet) or pat.search(sku):
                hit = (floor, tag)
                break
        if not hit:
            continue
        floor, tag = hit
        list_p = floor - 40
        p = profit(list_p, cost)
        if p >= -10:
            scored.append((p, sku, tag, dealer, cost, list_p, floor, snippet[:120]))

    scored.sort(reverse=True)
    print("=== SCORED FLIP CANDIDATES (floor-40 undercut, buyer pays ship) ===\n")
    for p, sku, tag, dealer, cost, list_p, floor, snip in scored[:40]:
        verdict = "GO" if p >= 50 else ("BE" if p >= 0 else "PASS")
        print(f"{verdict:4} {sku} | {tag} | dealer ${dealer:.2f} | list ${list_p} | profit ${p:.2f}")
        print(f"     {snip}\n")

    print("=== ALL DF5 HANDGUN-LIKE UNDER $500 (needs manual floor) ===\n")
    gunish = [
        r
        for r in rows
        if r[1] <= 500
        and re.search(
            r"9mm|\.380|\.22|10mm|45|pistol|carry|shield|glock|sig|sw|smith|beretta|canik|ruger|walther|ppk|bodyguard|hellcat|echelon|p320|p365|m&p",
            r[2],
            re.I,
        )
    ]
    gunish.sort(key=lambda x: x[1])
    for sku, price, snippet in gunish[:35]:
        print(f"${price:7.2f} {sku} | {re.sub(r'\\s+', ' ', snippet)[:100]}")

if __name__ == "__main__":
    main()
