"""Gun.deals retail asking prices for single-item valuation."""

from __future__ import annotations

import logging
import re
from urllib.parse import quote_plus

from bs4 import BeautifulSoup

from mmd_engine.adapters.valuation_base import ValuationAdapter
from mmd_engine.browser import goto_market_url
from mmd_engine.market_browser import market_page
from mmd_engine.models import utc_now_iso
from mmd_engine.util import parse_price, slug_id
from mmd_engine.valuation_models import FirearmQuery, MarketListing

logger = logging.getLogger(__name__)


class GunDealsValuationAdapter(ValuationAdapter):
    name = "gundeals"

    def fetch(self, query: FirearmQuery) -> list[MarketListing]:
        q = query.search_text()
        if not q:
            return []

        url = f"https://www.gun.deals/search?q={quote_plus(q)}"
        try:
            with market_page("gundeals") as page:
                goto_market_url(page, url, extra_wait_ms=5_000)
                html = page.content()
        except Exception as exc:
            logger.warning("Gun.deals fetch failed: %s", exc)
            return []

        low = html.lower()
        if "just a moment" in low or "challenge-platform" in low:
            logger.warning(
                "Gun.deals blocked by Cloudflare. "
                "Run: python -m mmd_engine.cli.market_auth gundeals"
            )
            return []

        return _parse_asking(html)


def _parse_asking(html: str) -> list[MarketListing]:
    soup = BeautifulSoup(html, "html.parser")
    now = utc_now_iso()
    rows: list[MarketListing] = []
    seen: set[str] = set()

    for anchor in soup.find_all("a", href=True):
        text = anchor.get_text(" ", strip=True)
        if not text or len(text) < 8:
            continue
        price = parse_price(text)
        if price is None and anchor.parent:
            price = parse_price(anchor.parent.get_text(" ", strip=True))
        if price is None:
            continue
        title = re.sub(r"\$[\d,]+(?:\.\d{2})?", "", text).strip()
        if len(title) < 4:
            continue
        key = title.lower()
        if key in seen:
            continue
        seen.add(key)
        href = anchor["href"]
        url = href if href.startswith("http") else ""
        rows.append(
            MarketListing(
                id=slug_id("gundeals", title, str(price)),
                source="gundeals",
                title=title,
                price=price,
                price_type="asking",
                condition="new",
                url=url,
                scraped_at=now,
            )
        )

    return rows[:40]
