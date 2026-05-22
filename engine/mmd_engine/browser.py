"""Shared Playwright helpers for dealer and market adapters."""

from __future__ import annotations

from contextlib import contextmanager
from pathlib import Path
from typing import Iterator

from mmd_engine.config import SESSIONS_DIR


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
        context = browser.new_context(**context_kwargs)
        page = context.new_page()
        try:
            yield page
        finally:
            context.close()
            browser.close()
