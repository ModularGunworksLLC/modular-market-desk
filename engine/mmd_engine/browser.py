"""Shared Playwright helpers for dealer and market adapters."""

from __future__ import annotations

from contextlib import contextmanager
from pathlib import Path
from typing import Iterator

from mmd_engine.age_gate import dismiss_age_gate, goto_dealer_page
from mmd_engine.config import SESSIONS_DIR

__all__ = ["browser_page", "dismiss_age_gate", "goto_dealer_page"]


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
