import re
from pathlib import Path

src = Path(r"C:\Users\micha\.cursor\projects\c-Users-micha-Projects-modular-market-desk\terminals\622378.txt")
if not src.exists():
    src = Path(__file__).resolve().parents[1] / "data" / "auction_sniper_results.txt"
raw = src.read_text(encoding="utf-8", errors="replace")
rows = []
for line in raw.splitlines():
    m = re.match(
        r"^\s*(\d+)\s*\|\s*\$?([\d,]+\.?\d*)\s*\|\s*([^\|]+)\|",
        line,
    )
    if m:
        parts = [p.strip() for p in line.split("|")]
        if len(parts) < 8:
            continue
        lot, bid, maxh = parts[0], parts[1].replace("$", ""), parts[2].replace("$", "").strip()
        comps = parts[5]
        verdict = parts[6]
        item = parts[7]
        rows.append((int(lot), bid, maxh.strip(), int(comps), verdict.strip(), item))
rows.sort(key=lambda x: x[0])
out = Path(__file__).resolve().parents[1] / "data" / "auction_sniper_summary.tsv"
lines = ["lot\tbid\tmax_hammer\tcomps\tverdict\ttitle"]
for r in rows:
    maxh = r[2].replace("\ufffd", "").strip() or "n/a"
    lines.append(f"{r[0]}\t{r[1]}\t{maxh}\t{r[3]}\t{r[4]}\t{r[5]}")
out.write_text("\n".join(lines) + "\n", encoding="utf-8")
print(
    f"Wrote {out} TOTAL={len(rows)} OK={sum(1 for r in rows if r[4]=='OK')} "
    f"OVER={sum(1 for r in rows if r[4].startswith('OVER'))} "
    f"NO_COMPS={sum(1 for r in rows if r[4]=='NO COMPS')} SKIP={sum(1 for r in rows if r[4]=='SKIP')}"
)
