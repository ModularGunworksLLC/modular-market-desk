"""Browser settings for public market scrapers (GunBroker, Gun.deals)."""

from __future__ import annotations

from pathlib import Path

from mmd_engine.browser import browser_page
from mmd_engine.config import env, session_path


def market_headless() -> bool:
    raw = env("MMD_MARKET_HEADLESS", "true").lower()
    return raw not in {"0", "false", "no", "off"}


def market_storage(site: str) -> Path | None:
    path = session_path(site)
    return path if path.exists() else None


def market_page(site: str | None = None):
    """Playwright page with optional saved session and headed override."""
    storage = market_storage(site) if site else None
    return browser_page(headless=market_headless(), storage_state=storage)
