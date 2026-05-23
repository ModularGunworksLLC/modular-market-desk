"""Zanders Sporting Goods dealer adapter (requires dealer session)."""

from __future__ import annotations

import logging
from urllib.parse import quote_plus

from mmd_engine.adapters.base import DealerAdapter
from mmd_engine.browser import browser_page, dismiss_age_gate, goto_dealer_page
from mmd_engine.config import session_path
from mmd_engine.credentials import get_site
from mmd_engine.models import CatalogItem, utc_now_iso
from mmd_engine.util import matches_query, parse_price, slug_id

logger = logging.getLogger(__name__)

LOGIN_URL = (
    "https://shop2.gzanders.com/customer/account/login/referer/"
    "aHR0cHM6Ly9zaG9wMi5nemFuZGVycy5jb20vY3VzdG9tZXIvYWNjb3VudC9pbmRleC8~/"
)
SEARCH_URL = "https://shop2.gzanders.com/catalogsearch/result/?q={query}"


class ZandersAdapter(DealerAdapter):
    name = "zanders"

    def search(self, query: str) -> list[CatalogItem]:
        site = get_site(self.name)
        if not site.enabled:
            return []
        session = session_path(self.name)
        if not session.exists() and not site.is_configured():
            logger.info(
                "Zanders: skip — add credentials in sites.local.yaml or .env, then: python -m mmd_engine.cli.auth zanders"
            )
            return []

        try:
            with browser_page(headless=True, storage_state=session) as page:
                if not session.exists():
                    _login(page)
                    page.context.storage_state(path=str(session))

                search_url = SEARCH_URL.format(query=quote_plus(query or ""))
                page.goto(search_url, wait_until="domcontentloaded", timeout=90_000)
                extra = (site.age_gate_yes,) if site.age_gate_yes else ()
                dismiss_age_gate(page, extra_css=extra)
                page.wait_for_timeout(3_000)
                text = page.inner_text("body")
        except Exception as exc:
            logger.warning("Zanders search failed: %s", exc)
            return []

        return _parse_search_text(text, query)


def _login(page) -> None:
    site = get_site("zanders")
    user = site.resolved_username()
    password = site.resolved_password()
    if not user or not password:
        raise RuntimeError("Set zanders credentials in sites.local.yaml or .env")

    extra = (site.age_gate_yes,) if site.age_gate_yes else ()
    goto_dealer_page(page, LOGIN_URL, timeout=90_000, extra_css=extra)
    page.wait_for_timeout(2_000)

    if page.locator('input[name="cf-turnstile-response"]').count() and not page.locator(
        "#email, input[name='login[username]']"
    ).count():
        raise RuntimeError(
            "Zanders login blocked by Cloudflare — run once: "
            "python -m mmd_engine.cli.auth zanders"
        )

    page.wait_for_selector(
        "#email, input[name='login[username]']",
        timeout=30_000,
    )
    page.fill(
        '#email, input[name="login[username]"], input[name="email"], input[type="email"]',
        user,
    )
    page.fill(
        '#pass, input[name="login[password]"], input[type="password"]',
        password,
    )
    page.click("#send2, button.action.login, button[type='submit'], input[type='submit']")
    page.wait_for_load_state("domcontentloaded", timeout=30_000)
    page.wait_for_timeout(2_000)


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
