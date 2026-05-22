"""Lipsey's wholesale adapter (requires dealer session)."""

from __future__ import annotations

import logging
import re
from urllib.parse import quote_plus

from mmd_engine.adapters.base import DealerAdapter
from mmd_engine.browser import browser_page
from mmd_engine.config import env, session_path
from mmd_engine.models import CatalogItem, utc_now_iso
from mmd_engine.util import matches_query, parse_price, slug_id

logger = logging.getLogger(__name__)

LOGIN_URL = "https://www.lipseys.com/login"
SEARCH_URL = "https://www.lipseys.com/itemfinder?q={query}"


class LipseysAdapter(DealerAdapter):
    name = "lipseys"

    def search(self, query: str) -> list[CatalogItem]:
        session = session_path(self.name)
        if not session.exists() and not (env("LIPSEYS_USER") and env("LIPSEYS_PASS")):
            logger.info("Lipseys: skip (no session — run: python -m mmd_engine.cli.auth lipseys)")
            return []

        try:
            with browser_page(headless=True, storage_state=session) as page:
                if not session.exists():
                    _login(page)
                    page.context.storage_state(path=str(session))

                page.goto(
                    SEARCH_URL.format(query=quote_plus(query or "")),
                    wait_until="networkidle",
                    timeout=90_000,
                )
                page.wait_for_timeout(3_000)
                text = page.inner_text("body")
        except Exception as exc:
            logger.warning("Lipseys search failed: %s", exc)
            return []

        return _parse_itemfinder_text(text, query)


def _login(page) -> None:
    user = env("LIPSEYS_USER")
    password = env("LIPSEYS_PASS")
    if not user or not password:
        raise RuntimeError("Set LIPSEYS_USER and LIPSEYS_PASS in engine/.env")

    page.goto(LOGIN_URL, wait_until="domcontentloaded", timeout=60_000)
    page.fill('input[type="email"], input[name="email"], input[name="username"]', user)
    page.fill('input[type="password"]', password)
    page.click('button[type="submit"], input[type="submit"]')
    page.wait_for_timeout(4_000)


def _parse_itemfinder_text(text: str, query: str) -> list[CatalogItem]:
    now = utc_now_iso()
    rows: list[CatalogItem] = []
    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]

    i = 0
    while i < len(lines):
        line = lines[i]
        price = parse_price(line)
        if price is None:
            i += 1
            continue

        title_parts: list[str] = []
        j = i - 1
        while j >= 0 and len(title_parts) < 3:
            prev = lines[j]
            if parse_price(prev) is not None:
                break
            if len(prev) > 3 and not prev.lower().startswith("page "):
                title_parts.insert(0, prev)
            j -= 1

        title = " ".join(title_parts) if title_parts else f"Item {len(rows) + 1}"
        if not matches_query(title, query):
            i += 1
            continue

        tokens = title.split()
        manufacturer = tokens[0] if tokens else "Unknown"
        model = " ".join(tokens[1:]) if len(tokens) > 1 else title
        in_stock = "out of stock" not in line.lower()
        on_sale = bool(re.search(r"sale|promo|off", line, re.I))

        rows.append(
            CatalogItem(
                id=slug_id("lipseys", manufacturer, model),
                source="lipseys",
                manufacturer=manufacturer,
                model=model,
                category="handgun",
                action="semi-auto",
                caliber=_guess_caliber(title),
                dealer_price=price,
                in_stock=in_stock,
                on_sale=on_sale,
                scraped_at=now,
            )
        )
        i += 1

    return rows


def _guess_caliber(title: str) -> str:
    match = re.search(
        r"\b(9mm|\.45|\.40|5\.56|\.308|\.22|10mm|\.357|\.380|5\.7)\b",
        title,
        re.I,
    )
    return match.group(0) if match else ""
