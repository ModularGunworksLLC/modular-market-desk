"""TrueGunValue.com adapter for estimates and listing comps."""

from __future__ import annotations

import logging
import re
from bs4 import BeautifulSoup

from mmd_engine.adapters.valuation_base import ValuationAdapter
from mmd_engine.browser import browser_page
from mmd_engine.matching import tgv_slug
from mmd_engine.models import utc_now_iso
from mmd_engine.util import parse_price, slug_id
from mmd_engine.valuation_models import FirearmQuery, MarketListing

logger = logging.getLogger(__name__)

CATEGORY_MAP = {
    "handgun": "pistol",
    "pistol": "pistol",
    "rifle": "rifle",
    "shotgun": "shotgun",
}


class TrueGunValueAdapter(ValuationAdapter):
    name = "truegunvalue"

    def fetch(self, query: FirearmQuery) -> list[MarketListing]:
        if not query.manufacturer or not query.model:
            return []

        cat = CATEGORY_MAP.get(query.category.lower(), "pistol")
        mfr = tgv_slug(query.manufacturer)
        model = tgv_slug(query.model)
        url = f"https://truegunvalue.com/{cat}/{mfr}/{model}/price-historical-value-199"

        try:
            with browser_page(headless=True) as page:
                page.goto(url, wait_until="domcontentloaded", timeout=90_000)
                page.wait_for_timeout(3_000)
                html = page.content()
        except Exception as exc:
            logger.warning("TrueGunValue fetch failed: %s", exc)
            return []

        return _parse_tgv_page(html, query)


def _parse_tgv_page(html: str, query: FirearmQuery) -> list[MarketListing]:
    soup = BeautifulSoup(html, "html.parser")
    now = utc_now_iso()
    text = soup.get_text("\n", strip=True)
    rows: list[MarketListing] = []
    title_base = f"{query.manufacturer} {query.model} {query.variant}".strip()

    new_avg = _extract_avg(text, r"worth an average price of \$([\d,]+(?:\.\d{2})?) new")
    used_avg = _extract_avg(text, r"\$([\d,]+(?:\.\d{2})?) used")
    if new_avg:
        rows.append(
            MarketListing(
                id=slug_id("tgv", "est-new", title_base),
                source="truegunvalue",
                title=f"{title_base} — TGV average new",
                price=new_avg,
                price_type="estimate",
                condition="new",
                scraped_at=now,
            )
        )
    if used_avg:
        rows.append(
            MarketListing(
                id=slug_id("tgv", "est-used", title_base),
                source="truegunvalue",
                title=f"{title_base} — TGV average used",
                price=used_avg,
                price_type="estimate",
                condition="used",
                scraped_at=now,
            )
        )

    for table in soup.find_all("table"):
        cells = table.get_text("\n", strip=True)
        if "PRICE:" not in cells.upper():
            continue
        price = parse_price(cells)
        if price is None:
            continue
        model_match = re.search(r"MODEL:\s*([^\n]+)", cells, re.I)
        cond_match = re.search(r"CONDITION:\s*([^\n]+)", cells, re.I)
        sold_match = re.search(r"SOLD:\s*([^\n]+)", cells, re.I)
        upc_match = re.search(r"UPC:\s*([^\n]+)", cells, re.I)
        title = model_match.group(1).strip() if model_match else title_base
        cond = (cond_match.group(1).strip() if cond_match else "used").lower()
        sold_date = sold_match.group(1).strip() if sold_match else ""
        upc = upc_match.group(1).strip() if upc_match else ""

        price_type = "sold" if "SOLD:" in cells.upper() else "asking"
        rows.append(
            MarketListing(
                id=slug_id("tgv", price_type, title, str(price)),
                source="truegunvalue",
                title=f"{query.manufacturer} {title}",
                price=price,
                price_type=price_type,  # type: ignore[arg-type]
                condition=cond,
                date=sold_date,
                upc=upc,
                scraped_at=now,
            )
        )

    return rows[:60]


def _extract_avg(text: str, pattern: str) -> float | None:
    match = re.search(pattern, text, re.I)
    if not match:
        return None
    raw = match.group(1).replace(",", "")
    try:
        return float(raw)
    except ValueError:
        return None
