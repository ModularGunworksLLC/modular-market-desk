"""Zanders Sporting Goods dealer adapter (requires dealer session)."""

from __future__ import annotations

import logging
from urllib.parse import quote_plus

from mmd_engine.adapters.base import DealerAdapter
from mmd_engine.browser import browser_page
from mmd_engine.config import env, session_path
from mmd_engine.models import CatalogItem, utc_now_iso
from mmd_engine.util import matches_query, parse_price, slug_id

logger = logging.getLogger(__name__)

LOGIN_URL = "https://www.zanders.com/login.asp"
SEARCH_URL = "https://www.zanders.com/search.asp?search={query}"


class ZandersAdapter(DealerAdapter):
    name = "zanders"

    def search(self, query: str) -> list[CatalogItem]:
        session = session_path(self.name)
        if not session.exists() and not (env("ZANDERS_USER") and env("ZANDERS_PASS")):
            logger.info("Zanders: skip (no session — run: python -m mmd_engine.cli.auth zanders)")
            return []

        try:
            with browser_page(headless=True, storage_state=session) as page:
                if not session.exists():
                    _login(page)
                    page.context.storage_state(path=str(session))

                page.goto(
                    SEARCH_URL.format(query=quote_plus(query or "")),
                    wait_until="domcontentloaded",
                    timeout=90_000,
                )
                page.wait_for_timeout(3_000)
                text = page.inner_text("body")
        except Exception as exc:
            logger.warning("Zanders search failed: %s", exc)
            return []

        return _parse_search_text(text, query)


def _login(page) -> None:
    user = env("ZANDERS_USER")
    password = env("ZANDERS_PASS")
    if not user or not password:
        raise RuntimeError("Set ZANDERS_USER and ZANDERS_PASS in engine/.env")

    page.goto(LOGIN_URL, wait_until="domcontentloaded", timeout=60_000)
    page.fill('input[name="username"], input[name="email"], input[type="text"]', user)
    page.fill('input[type="password"]', password)
    page.click('input[type="submit"], button[type="submit"]')
    page.wait_for_timeout(4_000)


def _parse_search_text(text: str, query: str) -> list[CatalogItem]:
    now = utc_now_iso()
    rows: list[CatalogItem] = []

    for line in text.splitlines():
        line = line.strip()
        if len(line) < 6:
            continue
        price = parse_price(line)
        if price is None:
            continue
        title = line.replace(f"${price:.2f}", "").strip()
        if not title or not matches_query(title, query):
            continue

        tokens = title.split()
        manufacturer = tokens[0] if tokens else "Unknown"
        model = " ".join(tokens[1:]) if len(tokens) > 1 else title

        rows.append(
            CatalogItem(
                id=slug_id("zanders", manufacturer, model),
                source="zanders",
                manufacturer=manufacturer,
                model=model,
                category="handgun",
                action="semi-auto",
                caliber="",
                dealer_price=price,
                in_stock="out of stock" not in line.lower(),
                on_sale="sale" in line.lower(),
                scraped_at=now,
            )
        )

    return rows
