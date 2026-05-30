"""Playwright login flows shared by CLI and API."""

from __future__ import annotations

import time
from pathlib import Path
from typing import Any

from mmd_engine.age_gate import dismiss_age_gate, goto_dealer_page
from mmd_engine.browser import browser_page
from mmd_engine.config import SESSIONS_DIR, session_path
from mmd_engine.credentials import SiteCredential, get_site

MARKET_SITE_URLS: dict[str, dict[str, str]] = {
    "outdoor_analytics": {
        "label": "Outdoor Analytics",
        "url": "https://hub.outdooranalytics.com/pricing",
    },
    "gunbroker": {
        "label": "GunBroker",
        "url": "https://www.gunbroker.com/",
    },
    "gundeals": {
        "label": "Gun.deals",
        "url": "https://www.gun.deals/",
    },
}


def try_auto_login(page, site: SiteCredential) -> None:
    user = site.resolved_username()
    password = site.resolved_password()
    extra = (site.age_gate_yes,) if site.age_gate_yes else ()
    if not user or not password:
        goto_dealer_page(page, site.login_url, timeout=60_000, extra_css=extra)
        return
    goto_dealer_page(page, site.login_url, timeout=90_000, extra_css=extra)
    page.wait_for_timeout(2_000)
    if site.id == "zanders":
        print(
            "Zanders uses Cloudflare — complete the checkbox/captcha if shown, "
            "then sign in (auto-fill may work after the challenge)."
        )
    try:
        if site.id == "zanders":
            page.wait_for_selector(
                "#email, input[name='login[username]']",
                timeout=120_000,
            )
            page.fill(
                "#email, input[name='login[username]'], input[type='email']",
                user,
                timeout=10_000,
            )
            page.fill(
                "#pass, input[name='login[password]'], input[type='password']",
                password,
                timeout=10_000,
            )
            page.click(
                "#send2, button.action.login, button[type='submit'], input[type='submit']",
                timeout=10_000,
            )
        else:
            page.fill(
                'input[type="email"], input[name="email"], input[name="username"]',
                user,
                timeout=10_000,
            )
            page.fill('input[type="password"]', password, timeout=10_000)
            page.click('button[type="submit"], input[type="submit"]', timeout=10_000)
        page.wait_for_timeout(4_000)
    except Exception:
        print("Auto-login did not complete — finish login manually in the browser.")


def refresh_dealer_session(
    site_id: str,
    *,
    headless: bool = True,
    wait_seconds: int = 5,
) -> Path:
    site = get_site(site_id)
    if not site.login_url:
        raise ValueError(f"No login URL for {site_id}")

    dest = session_path(site_id)
    SESSIONS_DIR.mkdir(parents=True, exist_ok=True)
    extra = (site.age_gate_yes,) if site.age_gate_yes else ()
    wait_ms = max(1, wait_seconds) * 1000

    with browser_page(
        headless=headless,
        storage_state=dest if dest.exists() else None,
    ) as page:
        if headless and site.is_configured():
            try_auto_login(page, site)
            dismiss_age_gate(page, extra_css=extra)
            page.wait_for_timeout(wait_ms)
        else:
            raise ValueError(
                "Dealer manual login requires headed mode — use CLI auth or upload session JSON"
            )
        page.context.storage_state(path=str(dest))
    return dest


def refresh_market_session_auto(site_id: str, *, wait_seconds: int = 5) -> Path:
    if site_id not in MARKET_SITE_URLS:
        raise ValueError(f"Unknown market site: {site_id}")

    site_cfg = get_site(site_id)
    if not site_cfg.is_configured() or not site_cfg.login_url:
        raise ValueError(
            f"Add {site_id} username/password in sites.local.yaml before server auto-login"
        )

    dest = session_path(site_id)
    SESSIONS_DIR.mkdir(parents=True, exist_ok=True)
    extra = (site_cfg.age_gate_yes,) if site_cfg.age_gate_yes else ()

    with browser_page(headless=True) as page:
        try_auto_login(page, site_cfg)
        dismiss_age_gate(page, extra_css=extra)
        page.wait_for_timeout(max(1, wait_seconds) * 1000)
        page.context.storage_state(path=str(dest))
    return dest


def refresh_market_session_headed(site_id: str, *, wait_seconds: int = 120) -> Path:
    if site_id not in MARKET_SITE_URLS:
        raise ValueError(f"Unknown market site: {site_id}")

    meta = MARKET_SITE_URLS[site_id]
    dest = session_path(site_id)
    SESSIONS_DIR.mkdir(parents=True, exist_ok=True)

    login_url = meta["url"]
    try:
        site_cfg = get_site(site_id)
        if site_cfg.login_url:
            login_url = site_cfg.login_url
    except KeyError:
        pass

    with browser_page(headless=False) as page:
        page.goto(login_url, wait_until="domcontentloaded", timeout=90_000)
        dismiss_age_gate(page)
        time.sleep(max(10, wait_seconds))
        page.context.storage_state(path=str(dest))
    return dest


def save_session_payload(site_id: str, payload: dict[str, Any]) -> Path:
    if "cookies" not in payload and "origins" not in payload:
        raise ValueError("Invalid Playwright storage state (expected cookies or origins)")
    dest = session_path(site_id)
    SESSIONS_DIR.mkdir(parents=True, exist_ok=True)
    dest.write_text(
        __import__("json").dumps(payload, indent=2),
        encoding="utf-8",
    )
    return dest
