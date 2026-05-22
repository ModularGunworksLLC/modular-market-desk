"""Gun.deals market adapter (Playwright — Cloudflare protected)."""

from __future__ import annotations

import logging
import re
from urllib.parse import quote_plus

from bs4 import BeautifulSoup

from mmd_engine.adapters.base import MarketAdapter
from mmd_engine.browser import browser_page
from mmd_engine.models import CatalogItem, CompItem, utc_now_iso
from mmd_engine.util import matches_query, parse_price, slug_id

logger = logging.getLogger(__name__)


class GunDealsAdapter(MarketAdapter):
    name = "gundeals"

    def search(self, query: str) -> tuple[list[CatalogItem], list[CompItem]]:
        url = f"https://www.gun.deals/search?q={quote_plus(query or 'handgun')}"
        try:
            with browser_page(headless=True) as page:
                page.goto(url, wait_until="domcontentloaded", timeout=90_000)
                page.wait_for_timeout(4_000)
                html = page.content()
        except Exception as exc:
            logger.warning("Gun.deals Playwright failed: %s", exc)
            return [], []

        if "Just a moment" in html or "challenge-platform" in html:
            logger.warning(
                "Gun.deals blocked by Cloudflare. Run sync locally or retry later."
            )
            return [], []

        return _parse_results(html, query)


def _parse_results(html: str, query: str) -> tuple[list[CatalogItem], list[CompItem]]:
    soup = BeautifulSoup(html, "html.parser")
    catalog: list[CatalogItem] = []
    comps: list[CompItem] = []
    now = utc_now_iso()

    candidates: list[tuple[str, float, str | None]] = []

    for anchor in soup.find_all("a", href=True):
        text = anchor.get_text(" ", strip=True)
        if not text or len(text) < 8:
            continue
        price = parse_price(text)
        if price is None:
            parent_text = anchor.parent.get_text(" ", strip=True) if anchor.parent else ""
            price = parse_price(parent_text)
        if price is None:
            continue
        title = re.sub(r"\$[\d,]+(?:\.\d{2})?", "", text).strip()
        if len(title) < 4:
            continue
        href = anchor["href"]
        candidates.append((title, price, href if href.startswith("http") else None))

    seen_titles: set[str] = set()
    for title, price, href in candidates:
        key = title.lower()
        if key in seen_titles:
            continue
        seen_titles.add(key)
        if not matches_query(title, query):
            continue

        parts = title.split(maxsplit=1)
        manufacturer = parts[0] if parts else "Unknown"
        model = parts[1] if len(parts) > 1 else title
        item_id = slug_id("gundeals", manufacturer, model, str(price))

        catalog.append(
            CatalogItem(
                id=item_id,
                source="gundeals",
                manufacturer=manufacturer,
                model=model,
                category="handgun",
                action="semi-auto",
                caliber="",
                dealer_price=price,
                in_stock=True,
                on_sale=True,
                scraped_at=now,
            )
        )
        comps.append(
            CompItem(
                id=f"{item_id}-comp-0",
                catalog_id=item_id,
                source="gundeals",
                asking_price=price,
                url=href,
                scraped_at=now,
            )
        )

    return catalog, comps
