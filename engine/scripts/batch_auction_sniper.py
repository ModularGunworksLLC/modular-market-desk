"""Batch auction sniper report."""

from __future__ import annotations

import re
import sys
from dataclasses import dataclass
from pathlib import Path

from mmd_engine.service.valuation import run_valuation
from mmd_engine.valuation_models import FirearmQuery

MFR_PREFIXES = [
    ("PALMETTO STATE ARMORY", "Palmetto State Armory"),
    ("HARRINGTON & RICHARDSON", "Harrington & Richardson"),
    ("NEW ENGLAND FIREARMS", "New England Firearms"),
    ("FOREHAND & WADSWORTH", "Forehand & Wadsworth"),
    ("J.P. SAUER & SOHN", "JP Sauer"),
    ("AMERICAN WESTERN ARMS", "American Western Arms"),
    ("PLAINFIELD MACHINE", "Plainfield"),
    ("AUTO ORDNANCE", "Auto-Ordnance"),
    ("RADICAL FIREARMS", "Radical Firearms"),
    ("CHARLES DALY", "Charles Daly"),
    ("SMITH & WESSON", "Smith & Wesson"),
    ("SMITH& WESSON", "Smith & Wesson"),
    ("SMITH AMD WESSON", "Smith & Wesson"),
    ("HI STANDARD", "Hi-Standard"),
    ("HI POINT", "Hi-Point"),
    ("HI PIONT", "Hi-Point"),
    ("HERITAGE MFG", "Heritage"),
    ("HENRY ARMS", "Henry"),
    ("DERYA ARMS", "Derya Arms"),
    ("CRESCENT FIREARMS", "Crescent"),
    ("L.C.SMITH", "LC Smith"),
    ("J.C HIGGINS", "JC Higgins"),
    ("TED WILLIAMS", "Ted Williams"),
    ("NEW HAVEN", "New Haven"),
    ("NAVY ARMS", "Navy Arms"),
    ("CHARTER ARMS", "Charter Arms"),
    ("IVER JOHNSON", "Iver Johnson"),
    ("GLENFIELD MARLIN", "Glenfield"),
    ("GLENFIELD", "Glenfield"),
    ("AMERICAN GUN CO", "American Gun Co"),
    ("SPRING FIELD", "Springfield"),
    ("F.LLIPIETTA", "Pietta"),
    ("EDWARD MAYNARD", "Maynard"),
    ("SABRE DEFENSE", "Sabre Defense"),
    ("CHINESE SKS", "SKS"),
    ("WINGMASTER", "Remington"),
    ("REMINGTON", "Remington"),
    ("WINCHESTER", "Winchester"),
    ("BROWNING", "Browning"),
    ("MOSSBERG", "Mossberg"),
    ("SAVAGE", "Savage"),
    ("MARLIN", "Marlin"),
    ("RUGER", "Ruger"),
    ("COLT", "Colt"),
    ("GLOCK", "Glock"),
    ("KIMBER", "Kimber"),
    ("TAURUS", "Taurus"),
    ("HERITAGE", "Heritage"),
    ("HENRY", "Henry"),
    ("BERGARA", "Bergara"),
    ("BENELLI", "Benelli"),
    ("DPMS", "DPMS"),
    ("NORINCO", "Norinco"),
    ("MITCHELL", "Mitchell"),
    ("ITHACA", "Ithaca"),
    ("STEVENS", "Stevens"),
    ("ROSSI", "Rossi"),
    ("STOEGER", "Stoeger"),
    ("ANSCHUTZ", "Anschutz"),
    ("SAKO", "Sako"),
    ("SPRINGFIELD", "Springfield"),
    ("WALTHER", "Walther"),
    ("BOITO", "Baikal"),
    ("BAIKAL", "Baikal"),
    ("JTS", "JTS"),
    ("CZ", "CZ"),
    ("FN", "FN"),
    ("CAI", "Mosin Nagant"),
    ("USSR", "Mosin Nagant"),
    ("CROSSMAN", "Crosman"),
    ("OPTIMA", "Optima"),
]

CAL_PATTERNS = [
    (r"30-06|30 06|3006", "30-06"),
    (r"30-30|3030|30 30", "30-30"),
    (r"22-250|22250", "22-250"),
    (r"22 MAG|22MAG", "22 WMR"),
    (r"22 SHORT|22SHORT", "22 Short"),
    (r"22 WRF|22WRF", "22 WRF"),
    (r"22 LONG RIFLE|22CAL|22 CAL|\.22\b", "22 LR"),
    (r"17HMR|17 CAL|17CAL", "17 HMR"),
    (r"357 ?MAG|357MAG|\.357", "357 Mag"),
    (r"38 SPL|38 CAL|38CAL", "38 Special"),
    (r"45 COLT", "45 Colt"),
    (r"45/410", "45/410"),
    (r"45CAL|45 CAL|45 ACP", "45 ACP"),
    (r"9MM|9 CAL|9CAL", "9mm"),
    (r"40CAL|40 CAL", "40 S&W"),
    (r"380MAG|380AUTO|380 AUTO|6\.35", "380 ACP"),
    (r"5\.7X28|5\.7", "5.7x28"),
    (r"410 ?GA|410GA", "410"),
    (r"20GA|20 GA|20 GAUGE", "20 gauge"),
    (r"16GA|16 GA|16 GAUGE|16GAUGE", "16 gauge"),
    (r"12GA|12 GA|12 GAUGE|12FA", "12 gauge"),
    (r"7\.62X39|762X39", "7.62x39"),
    (r"7\.62X54|762X54|91-30|91/38", "7.62x54r"),
    (r"223CAL|223REM|\.223|5\.56|556", "223/5.56"),
    (r"270WIN|270 WIN", "270 Win"),
    (r"243WIN|243 WIN", "243 Win"),
    (r"260REM|260 REM", "260 Rem"),
    (r"44MAG|44 MAG|44CAL|44 CAL", "44 Mag"),
    (r"32 CAL|32CAL", "32 Win"),
    (r"50CAL|50 CAL", "50 cal"),
    (r"6\.5", "6.5 Creedmoor"),
    (r"8 CAL|8MM", "8mm"),
]

SKIP = (
    "BB GUN",
    "AIR GUN",
    "BLACK POWDER",
    "BLACK POWER",
    "CROSSMAN",
    "CROSSMAN MODEL",
)


@dataclass
class Lot:
    num: int
    title: str
    bid: float


def parse_lots(text: str) -> list[Lot]:
    out: list[Lot] = []
    for line in text.splitlines():
        line = line.strip()
        if not line:
            continue
        m = re.match(r"^(\d+)\s+(.+?)\s+\$([\d,]+\.?\d*)\s*$", line)
        if m:
            out.append(Lot(int(m.group(1)), m.group(2).strip(), float(m.group(3).replace(",", ""))))
    return out


def category(title: str) -> str:
    t = title.upper()
    if any(x in t for x in ("SHOTGUN", " GA ", "GAUGE", "GA ", "SHOGUN")):
        return "shotgun"
    if any(x in t for x in ("PISTOL", "REVOLVER")):
        return "handgun"
    return "rifle"


def caliber(title: str) -> str:
    t = title.upper()
    for pat, cal in CAL_PATTERNS:
        if re.search(pat, t):
            return cal
    if re.search(r"\b30\b", t) and "RIFLE" in t:
        return "30-30"
    return ""


def manufacturer_and_model(title: str) -> tuple[str, str]:
    t = title.upper()
    for prefix, mfr in MFR_PREFIXES:
        if t.startswith(prefix):
            rest = title[len(prefix) :].strip(" -/")
            return mfr, rest
    parts = title.split()
    return (parts[0].title(), " ".join(parts[1:])) if parts else ("Unknown", title)


def clean_model(rest: str, title: str) -> str:
    s = re.sub(r"TRANS\s*#?\s*\d+.*$", "", rest, flags=re.I)
    s = re.sub(
        r"\b(LEVER|BOLT|SEMI|RIFLE|SHOTGUN|PISTOL|REVOLVER|PUMP|OVER/UNDER|DOUBLE|SINGLE|ACTION|RECEIVER|MULTI|AUTOMATIC|SHOGUN|GAUGE)\b.*$",
        "",
        s,
        flags=re.I,
    )
    for pat, _ in CAL_PATTERNS:
        s = re.sub(pat, "", s, flags=re.I)
    s = re.sub(r"\s+", " ", s).strip(" -,/")
    if not s:
        nums = re.findall(r"\b[A-Z0-9][A-Z0-9/-]{1,15}\b", title.upper())
        s = nums[0] if nums else "Unknown"
    return s[:80]


def build_query(title: str) -> FirearmQuery | None:
    u = title.upper()
    if any(k in u for k in SKIP):
        return None
    if u.startswith(("12 GA SINGLE", "16GAUGE DOUBLE", "SEMI AUTOMATIC RIFLE")):
        return None
    mfr, rest = manufacturer_and_model(title)
    if mfr == "Unknown":
        return None
    return FirearmQuery(
        category=category(title),
        manufacturer=mfr,
        model=clean_model(rest, title),
        caliber=caliber(title),
        condition="used",
    )


def fmt_money(n: float | None) -> str:
    if n is None or n <= 0:
        return "—"
    return f"${n:,.0f}"


def main() -> None:
    path = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).resolve().parents[1] / "data" / "auction_lots.txt"
    lots = parse_lots(path.read_text(encoding="utf-8"))
    print(f"Running {len(lots)} lots (18% premium, $10 listing add-ons, cache when available)...")
    print("Lot | Your Bid | Max Hammer | All-in @ Max | P75 Sell | Comps | Verdict | Item")
    print("-" * 120)

    ok = over = no_data = skip = 0
    for lot in lots:
        q = build_query(lot.title)
        if q is None:
            skip += 1
            print(f"{lot.num:>3} | {fmt_money(lot.bid):>8} | — | — | — | 0 | SKIP | {lot.title}")
            continue
        try:
            r = run_valuation(
                q,
                context="auction_sniper",
                buyer_premium_pct=18.0,
                listing_addons=10.0,
                use_cache=True,
                force_refresh=False,
                sample_only=False,
            )
        except Exception as exc:
            no_data += 1
            print(f"{lot.num:>3} | {fmt_money(lot.bid):>8} | — | — | — | 0 | ERR | {lot.title[:50]} ({exc})")
            continue

        max_bid = r.insights.max_bid
        all_in = r.insights.assumptions.get("all_in_at_max_bid")
        p75 = r.insights.assumptions.get("gross_sale") or (
            r.sold_stats.p75 if r.sold_stats.p75 else r.sold_stats.median
        )
        n = r.sold_stats.count
        if n <= 0 or not max_bid:
            no_data += 1
            verdict = "NO COMPS"
        elif lot.bid <= max_bid:
            ok += 1
            verdict = "OK"
        else:
            over += 1
            verdict = f"OVER +${lot.bid - max_bid:,.0f}"

        print(
            f"{lot.num:>3} | {fmt_money(lot.bid):>8} | {fmt_money(max_bid):>10} | "
            f"{fmt_money(float(all_in) if all_in else None):>11} | {fmt_money(float(p75) if p75 else None):>8} | "
            f"{n:>5} | {verdict:<12} | {lot.title}"
        )
        sys.stdout.flush()

    print("-" * 120)
    print(f"Summary: {ok} within ceiling, {over} over ceiling, {no_data} no comps/error, {skip} skipped (BB/air/black powder/generic)")


if __name__ == "__main__":
    main()
