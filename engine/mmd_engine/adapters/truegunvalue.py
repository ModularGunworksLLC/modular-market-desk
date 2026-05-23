"""TrueGunValue.com adapter for estimates and listing comps."""

from __future__ import annotations

import logging
import re
from bs4 import BeautifulSoup

from mmd_engine.adapters.valuation_base import ValuationAdapter
from mmd_engine.browser import browser_page, dismiss_age_gate
from mmd_engine.dates import sold_date_iso
from mmd_engine.matching import tgv_canonical_page_slug, tgv_model_slugs, tgv_slug
from mmd_engine.models import utc_now_iso
from mmd_engine.util import parse_price, slug_id
from mmd_engine.valuation_models import FirearmQuery, MarketListing

logger = logging.getLogger(__name__)

CATEGORY_MAP = {
    "handgun": "pistol",
    "pistol": "pistol",
    "rifle": "rifle",
    "shotgun": "shotgun",
}


class TrueGunValueAdapter(ValuationAdapter):
    name = "truegunvalue"

    def fetch(self, query: FirearmQuery) -> list[MarketListing]:
        if not query.manufacturer or not query.model:
            return []

        cat = CATEGORY_MAP.get(query.category.lower(), "pistol")
        mfr = tgv_slug(query.manufacturer)
        slugs = tgv_model_slugs(query)
        rows: list[MarketListing] = []
        seen_ids: set[str] = set()

        canonical = tgv_canonical_page_slug(query)

        try:
            with browser_page(headless=True) as page:
                slug_plan: list[tuple[str, str]] = []
                if canonical:
                    slug_plan.append(("canonical", canonical))
                for model_slug in slugs:
                    if model_slug != canonical:
                        slug_plan.append(("legacy", model_slug))

                for kind, slug in slug_plan:
                    suffixes = ("price-historical-value", "price-historical-value-199")
                    for suffix in suffixes:
                        if kind == "canonical":
                            url = f"https://truegunvalue.com/{cat}/{slug}/{suffix}"
                        else:
                            url = f"https://truegunvalue.com/{cat}/{mfr}/{slug}/{suffix}"
                        page.goto(url, wait_until="domcontentloaded", timeout=90_000)
                        dismiss_age_gate(page)
                        page.wait_for_timeout(2_500)
                        if _is_cloudflare_challenge(page):
                            page.wait_for_timeout(12_000)
                        html = page.content()
                        if _html_is_cloudflare(html):
                            logger.warning("TrueGunValue blocked by Cloudflare on %s", url)
                            continue
                        before = len(rows)
                        for row in _parse_tgv_page(html, query):
                            if row.id not in seen_ids:
                                seen_ids.add(row.id)
                                rows.append(row)
                        sold_added = sum(
                            1 for r in rows[before:] if r.price_type == "sold"
                        )
                        if kind == "canonical" and sold_added >= 3:
                            break
                    if kind == "canonical" and len(rows) >= 10:
                        break
                    if len(rows) >= 60:
                        break
        except Exception as exc:
            logger.warning("TrueGunValue fetch failed: %s", exc)
            return rows

        if not rows:
            logger.warning(
                "TrueGunValue returned no listings — may be blocked or model slug mismatch."
            )
        return rows[:60]


def _is_cloudflare_challenge(page) -> bool:
    title = (page.title() or "").lower()
    return "just a moment" in title or "security" in title


def _html_is_cloudflare(html: str) -> bool:
    low = html.lower()
    return "just a moment" in low or "performing security verification" in low


def _parse_tgv_page(html: str, query: FirearmQuery) -> list[MarketListing]:
    soup = BeautifulSoup(html, "html.parser")
    now = utc_now_iso()
    text = soup.get_text("\n", strip=True)
    rows: list[MarketListing] = []
    title_base = f"{query.manufacturer} {query.model} {query.variant}".strip()

    new_avg = _extract_avg(text, r"worth an average price of \$([\d,]+(?:\.\d{2})?) new")
    used_avg = _extract_avg(text, r"\$([\d,]+(?:\.\d{2})?) used")
    if new_avg:
        rows.append(
            MarketListing(
                id=slug_id("tgv", "est-new", title_base),
                source="truegunvalue",
                title=f"{title_base} — TGV average new",
                price=new_avg,
                price_type="estimate",
                condition="new",
                scraped_at=now,
            )
        )
    if used_avg:
        rows.append(
            MarketListing(
                id=slug_id("tgv", "est-used", title_base),
                source="truegunvalue",
                title=f"{title_base} — TGV average used",
                price=used_avg,
                price_type="estimate",
                condition="used",
                scraped_at=now,
            )
        )

    rows.extend(_parse_tgv_blocks(text, query, title_base, now))

    for table in soup.find_all("table"):
        cells = table.get_text("\n", strip=True)
        row = _listing_from_tgv_block(cells, query, title_base, now)
        if row:
            rows.append(row)

    return rows[:60]


def _parse_tgv_blocks(text: str, query: FirearmQuery, title_base: str, now: str) -> list[MarketListing]:
    rows: list[MarketListing] = []
    for chunk in re.split(r"(?=PRICE:\s*\$)", text, flags=re.I):
        row = _listing_from_tgv_block(chunk, query, title_base, now)
        if row:
            rows.append(row)
    return rows


_TGV_FIELD_PREFIXES = (
    "PRICE:",
    "MANUFACTURER:",
    "CONDITION:",
    "MODEL:",
    "SOLD:",
    "UPC:",
    "SKU:",
    "CALIBER:",
    "MANF",
    "CAPACITY:",
    "BARREL",
    "LOCATION:",
)


def _tgv_display_title(block: str, model_field: str, title_base: str) -> str:
    """Prefer the long GunBroker-style line TGV puts after structured fields."""
    lines = [ln.strip() for ln in block.splitlines() if ln.strip()]
    candidates: list[str] = []
    for ln in lines:
        up = ln.upper()
        if any(up.startswith(p) for p in _TGV_FIELD_PREFIXES):
            continue
        if len(ln) >= 24:
            candidates.append(ln)
    if candidates:
        return candidates[-1]
    model = (model_field or "").strip()
    if model and model.upper() not in {"OTHER MODEL", "SOLD:", "OTHER"}:
        return model
    return title_base


def _listing_from_tgv_block(
    block: str,
    query: FirearmQuery,
    title_base: str,
    now: str,
) -> MarketListing | None:
    if "PRICE:" not in block.upper():
        return None
    price = parse_price(block)
    if price is None:
        return None
    model_match = re.search(r"MODEL:\s*([^\n]+)", block, re.I)
    cond_match = re.search(r"CONDITION:\s*([^\n]+)", block, re.I)
    sold_match = re.search(r"SOLD:\s*([^\n]+)", block, re.I)
    upc_match = re.search(r"UPC:\s*([^\n]+)", block, re.I)
    cal_match = re.search(r"CALIBER:\s*([^\n]+)", block, re.I)
    model_field = model_match.group(1).strip() if model_match else ""
    display = _tgv_display_title(block, model_field, title_base)
    caliber = cal_match.group(1).strip() if cal_match else ""
    title = display
    if caliber:
        title = f"{title} {caliber}"
    cond = (cond_match.group(1).strip() if cond_match else "used").lower()
    sold_raw = sold_match.group(1).strip() if sold_match else ""
    upc = upc_match.group(1).strip() if upc_match else ""
    price_type = "sold" if sold_raw or "SOLD:" in block.upper() else "asking"
    date_iso = sold_date_iso(sold_raw) if sold_raw else ""
    return MarketListing(
        id=slug_id("tgv", price_type, title, str(price)),
        source="truegunvalue",
        title=title,
        price=price,
        price_type=price_type,  # type: ignore[arg-type]
        condition=cond,
        date=date_iso,
        upc=upc,
        scraped_at=now,
    )


def _extract_avg(text: str, pattern: str) -> float | None:
    match = re.search(pattern, text, re.I)
    if not match:
        return None
    raw = match.group(1).replace(",", "")
    try:
        return float(raw)
    except ValueError:
        return None
