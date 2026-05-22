"""GunBroker sold and active listings adapter."""

from __future__ import annotations

import logging
import re
from urllib.parse import quote_plus

from bs4 import BeautifulSoup

from mmd_engine.adapters.valuation_base import ValuationAdapter
from mmd_engine.browser import browser_page
from mmd_engine.models import utc_now_iso
from mmd_engine.util import parse_price, slug_id
from mmd_engine.valuation_models import FirearmQuery, MarketListing

logger = logging.getLogger(__name__)


class GunBrokerAdapter(ValuationAdapter):
    name = "gunbroker"

    def fetch(self, query: FirearmQuery) -> list[MarketListing]:
        q = query.search_text()
        if not q:
            return []

        listings: list[MarketListing] = []
        try:
            listings.extend(self._fetch_completed(q))
            listings.extend(self._fetch_active(q))
        except Exception as exc:
            logger.warning("GunBroker fetch failed: %s", exc)
        return listings

    def _fetch_completed(self, q: str) -> list[MarketListing]:
        url = (
            "https://www.gunbroker.com/All/search"
            f"?Keywords={quote_plus(q)}&Sort=13&PageSize=48&Completed=true"
        )
        return self._parse_search_page(url, q, price_type="sold")

    def _fetch_active(self, q: str) -> list[MarketListing]:
        url = (
            "https://www.gunbroker.com/All/search"
            f"?Keywords={quote_plus(q)}&Sort=13&PageSize=48"
        )
        return self._parse_search_page(url, q, price_type="asking")

    def _parse_search_page(
        self, url: str, q: str, *, price_type: str
    ) -> list[MarketListing]:
        try:
            with browser_page(headless=True) as page:
                page.goto(url, wait_until="domcontentloaded", timeout=90_000)
                page.wait_for_timeout(3_000)
                html = page.content()
        except Exception as exc:
            logger.warning("GunBroker Playwright: %s", exc)
            return []

        if "captcha" in html.lower() or "access denied" in html.lower():
            logger.warning("GunBroker blocked or captcha")
            return []

        return _parse_listings_html(html, self.name, price_type)


def _parse_listings_html(html: str, source: str, price_type: str) -> list[MarketListing]:
    soup = BeautifulSoup(html, "html.parser")
    now = utc_now_iso()
    rows: list[MarketListing] = []

    for card in soup.select("[class*='listing'], article, .item-card, .search-result"):
        title_el = card.select_one("a[href*='/item/'], h2, h3, .item-title")
        if not title_el:
            continue
        title = title_el.get_text(" ", strip=True)
        if len(title) < 6:
            continue
        price_el = card.get_text(" ", strip=True)
        price = parse_price(price_el)
        if price is None:
            continue
        href = ""
        if title_el.name == "a" and title_el.get("href"):
            href = title_el["href"]
            if href.startswith("/"):
                href = f"https://www.gunbroker.com{href}"

        cond = "used"
        if re.search(r"\bnew\b", title, re.I):
            cond = "new"

        rows.append(
            MarketListing(
                id=slug_id(source, price_type, title, str(price)),
                source=source,
                title=title,
                price=price,
                price_type=price_type,  # type: ignore[arg-type]
                condition=cond,
                url=href,
                scraped_at=now,
            )
        )

    if rows:
        return rows[:48]

    for anchor in soup.find_all("a", href=True):
        href = anchor["href"]
        if "/item/" not in href:
            continue
        title = anchor.get_text(" ", strip=True)
        if len(title) < 8:
            continue
        parent_text = anchor.parent.get_text(" ", strip=True) if anchor.parent else title
        price = parse_price(parent_text)
        if price is None:
            continue
        full_url = href if href.startswith("http") else f"https://www.gunbroker.com{href}"
        rows.append(
            MarketListing(
                id=slug_id(source, price_type, title, str(price)),
                source=source,
                title=title,
                price=price,
                price_type=price_type,  # type: ignore[arg-type]
                condition="used",
                url=full_url,
                scraped_at=now,
            )
        )

    return rows[:48]
