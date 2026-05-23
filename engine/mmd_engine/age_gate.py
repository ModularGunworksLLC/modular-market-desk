"""Dismiss common firearms retail age-verification overlays before login/search."""

from __future__ import annotations

import logging
import re
from typing import Any

logger = logging.getLogger(__name__)

# Visible affirmative controls (avoid "No" / "Leave")
_AFFIRMATIVE_RE = re.compile(
    r"^(yes|enter|continue|confirm|accept|agree|proceed|ok)$|"
    r"i\s*am\s*(21|18|over)|"
    r"(21|18)\s*or\s*older|"
    r"over\s*(21|18)|"
    r"of\s*legal\s*age|"
    r"legal\s*age|"
    r"dealer\s*login",
    re.I,
)

_CSS_AFFIRMATIVE = (
    "#age-verify-button-yes",
    "#age-gate-yes",
    "#ageGateYes",
    ".age-gate-yes",
    ".age-verify-yes",
    ".agegate-yes",
    "button.age-yes",
    "a.age-yes",
    "[data-age-gate='yes']",
    "[data-age-verify='yes']",
)

_GATE_TEXT_HINTS = (
    "21 years",
    "21 or older",
    "18 or older",
    "legal age",
    "age verification",
    "confirm your age",
    "you must be",
    "are you 21",
    "are you 18",
    "age gate",
    "verify your age",
)


def page_looks_like_age_gate(page: Any) -> bool:
    try:
        snippet = (page.inner_text("body") or "")[:5000].lower()
    except Exception:
        return False
    return any(hint in snippet for hint in _GATE_TEXT_HINTS)


def dismiss_age_gate(page: Any, *, extra_css: tuple[str, ...] = (), max_rounds: int = 4) -> bool:
    """
    Click through age gates when possible. Returns True if at least one click was made.
    Saved Playwright sessions usually remember the cookie after the first headed auth.
    """
    clicked = False
    for _ in range(max_rounds):
        page.wait_for_timeout(600)
        if not page_looks_like_age_gate(page) and not _has_gate_overlay(page):
            break
        if _click_css(page, extra_css):
            clicked = True
            page.wait_for_timeout(900)
            continue
        if _click_by_role(page, "button"):
            clicked = True
            page.wait_for_timeout(900)
            continue
        if _click_by_role(page, "link"):
            clicked = True
            page.wait_for_timeout(900)
            continue
        break

    if clicked:
        logger.debug("Age gate dismissed")
    return clicked


def goto_dealer_page(
    page: Any,
    url: str,
    *,
    wait_until: str = "domcontentloaded",
    timeout: float = 90_000,
    extra_css: tuple[str, ...] = (),
) -> None:
    """Navigate and attempt to clear age verification before login or scrape."""
    page.goto(url, wait_until=wait_until, timeout=timeout)
    page.wait_for_timeout(800)
    dismiss_age_gate(page, extra_css=extra_css)


def _has_gate_overlay(page: Any) -> bool:
    for sel in (
        ".age-gate",
        ".age-gate-overlay",
        "#age-gate",
        "#ageGate",
        "[class*='age-gate']",
        "[id*='age-gate']",
    ):
        try:
            loc = page.locator(sel).first
            if loc.count() and loc.is_visible():
                return True
        except Exception:
            continue
    return False


def _click_css(page: Any, extra_css: tuple[str, ...] = ()) -> bool:
    for sel in (*extra_css, *_CSS_AFFIRMATIVE):
        try:
            loc = page.locator(sel).first
            if loc.count() and loc.is_visible():
                loc.click(timeout=4_000)
                return True
        except Exception:
            continue
    return False


def _click_by_role(page: Any, role: str) -> bool:
    try:
        elements = page.get_by_role(role)
        count = elements.count()
    except Exception:
        return False

    for i in range(min(count, 12)):
        try:
            el = elements.nth(i)
            if not el.is_visible():
                continue
            name = (el.inner_text() or "").strip()
            if not name or not _AFFIRMATIVE_RE.search(name):
                continue
            if re.search(r"\bno\b|leave|under\s*18|under\s*21", name, re.I):
                continue
            el.click(timeout=4_000)
            return True
        except Exception:
            continue
    return False
