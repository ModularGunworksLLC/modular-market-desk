"""Shared Playwright helpers for dealer and market adapters."""

from __future__ import annotations

from contextlib import contextmanager
from pathlib import Path
from typing import Iterator

from mmd_engine.age_gate import dismiss_age_gate, goto_dealer_page
from mmd_engine.config import SESSIONS_DIR, nav_timeout_ms, nav_wait_until

__all__ = ["browser_page", "dismiss_age_gate", "goto_dealer_page", "goto_market_url"]


@contextmanager
def browser_page(
    *,
    headless: bool = True,
    storage_state: Path | None = None,
) -> Iterator:
    try:
        from playwright.sync_api import sync_playwright
    except ImportError as exc:
        raise RuntimeError(
            "Playwright is not installed. Run: pip install playwright && playwright install chromium"
        ) from exc

    SESSIONS_DIR.mkdir(parents=True, exist_ok=True)

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=headless)
        context_kwargs: dict = {}
        if storage_state and storage_state.exists():
            context_kwargs["storage_state"] = str(storage_state)
        context_kwargs.setdefault(
            "user_agent",
            (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/122.0.0.0 Safari/537.36"
            ),
        )
        context_kwargs.setdefault("viewport", {"width": 1280, "height": 720})
        context = browser.new_context(**context_kwargs)
        page = context.new_page()
        try:
            yield page
        finally:
            context.close()
            browser.close()


def goto_market_url(page, url: str, *, extra_wait_ms: int = 0) -> None:
    """Navigate to a public market URL (TGV, GunBroker, Gun.deals)."""
    page.goto(url, wait_until=nav_wait_until(), timeout=nav_timeout_ms())
    dismiss_age_gate(page)
    if extra_wait_ms > 0:
        page.wait_for_timeout(extra_wait_ms)
