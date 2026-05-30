"""Outdoor Analytics / GunBroker Analytics portal pricing API."""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from typing import Any

from mmd_engine.adapters.valuation_base import ValuationAdapter
from mmd_engine.clients.gba_api import GbaApiClient, GbaApiError
from mmd_engine.dates import sold_date_iso
from mmd_engine.matching import build_caliber_tokens, build_model_aliases
from mmd_engine.models import utc_now_iso
from mmd_engine.oa_session import load_bearer_token
from mmd_engine.util import slug_id
from mmd_engine.valuation_models import Condition, FirearmQuery, MarketListing

logger = logging.getLogger(__name__)

SOURCE = "outdoor-analytics"


@dataclass(frozen=True)
class OaSelection:
    condition_key: str  # NEW or USED
    condition_param: str  # New or Used
    manufacturer_id: int
    manufacturer: str
    model_id: int
    model: str
    caliber_id: int
    caliber: str
    score: float


def _norm(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", (text or "").lower())


def _oa_conditions(query: FirearmQuery) -> list[str]:
    cond = (query.condition or "any").lower()
    if cond == "new":
        return ["NEW"]
    if cond in {"used", "lnib"}:
        return ["USED"]
    return ["NEW", "USED"]


def _condition_param(key: str) -> str:
    return "Used" if key == "USED" else "New"


def _listing_condition_label(key: str) -> str:
    return "used" if key == "USED" else "new"


def _model_search_tokens(query: FirearmQuery) -> list[str]:
    tokens: list[str] = []
    for value in (query.model, query.variant):
        for part in (value or "").lower().split():
            part = part.strip()
            if len(part) >= 2 or part in {"ii", "iv", "v"}:
                tokens.append(part)
    for alias in build_model_aliases(query):
        for part in alias.lower().split():
            if len(part) >= 2:
                tokens.append(part)
    mdl = (query.model or "").lower().strip()
    if mdl.isdigit():
        tokens.append(mdl)
        tokens.append(f"g{mdl}")
    variant = (query.variant or "").lower()
    if "gen" in variant and "5" in variant:
        tokens.extend(["gen5", "gen", "5"])
    if "gen" in variant and "4" in variant:
        tokens.extend(["gen4", "gen", "4"])
    return list(dict.fromkeys(tokens))


def _score_model_name(model_name: str, tokens: list[str]) -> float:
    if not tokens:
        return 0.0
    name = model_name.lower()
    norm_name = _norm(name)

    for tok in tokens:
        if tok.isdigit():
            if f"g{tok}" in norm_name or f"glock{tok}" in norm_name:
                return 92.0
            if re.search(rf"\b{re.escape(tok)}\b", name):
                return 88.0
        if tok.startswith("g") and tok[1:].isdigit() and tok in norm_name:
            return 95.0

    matched = 0
    for tok in tokens:
        if tok.isdigit():
            continue
        if tok in name or tok.replace(" ", "") in norm_name:
            matched += 1
    if matched == 0:
        return 0.0
    return min(75.0, matched / max(1, len(tokens)) * 100.0)


def _score_caliber(caliber_name: str | None, query: FirearmQuery) -> float:
    if not query.caliber.strip():
        return 50.0
    if not caliber_name:
        return 10.0
    title = caliber_name.lower()
    forms = build_caliber_tokens(query.caliber)
    if any(f.replace("-", " ") in title or f in title for f in forms):
        return 100.0
    if "45" in forms and re.search(r"45|\.45", title):
        return 90.0
    return 0.0


def _score_manufacturer(mfr_name: str, query: FirearmQuery) -> float:
    q = _norm(query.manufacturer)
    n = _norm(mfr_name)
    if not q:
        return 0.0
    if q == n or q in n or n in q:
        return 100.0
    q_tokens = [t for t in query.manufacturer.lower().split() if len(t) >= 3]
    if q_tokens and all(t in mfr_name.lower() for t in q_tokens):
        return 80.0
    return 0.0


def resolve_selection(
    deps: dict[str, Any],
    query: FirearmQuery,
) -> OaSelection | None:
    """Map desk form fields to OA manufacturer / model / caliber IDs."""
    model_tokens = _model_search_tokens(query)
    best: OaSelection | None = None

    for cond_key in _oa_conditions(query):
        nodes = deps.get(cond_key) or []
        if not isinstance(nodes, list):
            continue
        for node in nodes:
            mfr_name = str(node.get("Manufacturer") or "")
            mfr_score = _score_manufacturer(mfr_name, query)
            if mfr_score < 50:
                continue
            mfr_id = int(node.get("ManufacturerID") or 0)
            models = node.get("Models") or []
            if not isinstance(models, list):
                continue
            for model_node in models:
                model_name = str(model_node.get("Model") or "")
                model_score = _score_model_name(model_name, model_tokens)
                if model_score < 50:
                    continue
                model_id = int(model_node.get("ModelID") or 0)
                calibers = model_node.get("Calibers") or []
                if not isinstance(calibers, list) or not calibers:
                    continue
                for cal in calibers:
                    cal_name = cal.get("Caliber")
                    cal_score = _score_caliber(
                        str(cal_name) if cal_name is not None else None,
                        query,
                    )
                    if query.caliber.strip() and cal_score < 50:
                        continue
                    cal_id = int(cal.get("CaliberID") or 0)
                    total = mfr_score * 0.25 + model_score * 0.55 + cal_score * 0.2
                    if node.get("IsCommonManufacturer"):
                        total += 2.0
                    candidate = OaSelection(
                        condition_key=cond_key,
                        condition_param=_condition_param(cond_key),
                        manufacturer_id=mfr_id,
                        manufacturer=mfr_name,
                        model_id=model_id,
                        model=model_name,
                        caliber_id=cal_id,
                        caliber=str(cal_name or ""),
                        score=total,
                    )
                    if best is None or candidate.score > best.score:
                        best = candidate
    return best


def _active_listing_price(row: dict[str, Any]) -> float | None:
    listing_type = str(row.get("ListingType") or "")
    if listing_type == "FIXED PRICE":
        fixed = row.get("FixedPrice")
        if fixed is not None:
            try:
                return float(fixed)
            except (TypeError, ValueError):
                pass
    for key in ("CurrentBid", "StartingBid"):
        val = row.get(key)
        if val is not None:
            try:
                n = float(val)
                if n > 0:
                    return n
            except (TypeError, ValueError):
                continue
    return None


def _sold_rows_to_listings(
    rows: list[dict[str, Any]],
    *,
    selection: OaSelection,
    title_prefix: str,
) -> list[MarketListing]:
    now = utc_now_iso()
    out: list[MarketListing] = []
    cond_label = _listing_condition_label(selection.condition_key)

    for row in rows:
        try:
            amount = float(row.get("Amount"))
        except (TypeError, ValueError):
            continue
        if amount <= 0:
            continue
        sales_date = str(row.get("SalesDate") or "")
        listing_type = str(row.get("ListingType") or "")
        title = f"{title_prefix} {selection.manufacturer} {selection.model}"
        if selection.caliber:
            title += f" {selection.caliber}"
        if listing_type:
            title += f" ({listing_type})"
        row_id = slug_id(
            SOURCE,
            "sold",
            str(selection.model_id),
            str(selection.caliber_id),
            sales_date,
            str(amount),
            listing_type,
        )
        out.append(
            MarketListing(
                id=row_id,
                source=SOURCE,
                title=title.strip(),
                price=round(amount, 2),
                price_type="sold",
                scraped_at=now,
                condition=cond_label,
                date=sold_date_iso(sales_date) if sales_date else "",
            )
        )
    return out


def _active_rows_to_listings(
    rows: list[dict[str, Any]],
    *,
    selection: OaSelection,
) -> list[MarketListing]:
    now = utc_now_iso()
    out: list[MarketListing] = []
    cond_label = _listing_condition_label(selection.condition_key)

    for row in rows:
        price = _active_listing_price(row)
        if price is None or price <= 0:
            continue
        item_id = row.get("ItemID")
        title = str(row.get("ItemTitle") or row.get("Title") or "").strip()
        if not title:
            title = f"{selection.manufacturer} {selection.model}"
        url = ""
        if item_id is not None:
            url = f"https://www.gunbroker.com/item/{item_id}"
        listing_cond = str(row.get("Condition") or cond_label)
        loc_parts = [
            str(row.get("ShipsFromCity") or "").strip(),
            str(row.get("ShipsFromState") or "").strip(),
        ]
        location = ", ".join(p for p in loc_parts if p)
        row_id = slug_id(SOURCE, "ask", str(item_id or title), str(price))
        out.append(
            MarketListing(
                id=row_id,
                source=SOURCE,
                title=title,
                price=round(price, 2),
                price_type="asking",
                scraped_at=now,
                condition=listing_cond.lower(),
                url=url,
                location=location,
            )
        )
    return out


class OutdoorAnalyticsAdapter(ValuationAdapter):
    name = SOURCE

    def fetch(self, query: FirearmQuery) -> list[MarketListing]:
        token = load_bearer_token()
        if not token:
            logger.warning("Outdoor Analytics: no bearer token (capture with oa_auth CLI)")
            return []
        if not query.manufacturer or not query.model:
            return []

        try:
            client = GbaApiClient(token)
            deps = client.pricing_dependencies()
        except GbaApiError as exc:
            logger.warning("Outdoor Analytics API failed: %s", exc)
            return []

        selection = resolve_selection(deps, query)
        if not selection:
            logger.warning(
                "Outdoor Analytics: no catalog match for %s %s",
                query.manufacturer,
                query.model,
            )
            return []

        logger.info(
            "Outdoor Analytics match: %s %s / %s (%s) score=%.1f",
            selection.manufacturer,
            selection.model,
            selection.caliber,
            selection.condition_param,
            selection.score,
        )

        title_prefix = f"{selection.manufacturer} {selection.model}".strip()
        try:
            sold_raw = client.pricing_data(
                model_id=selection.model_id,
                caliber_id=selection.caliber_id,
                condition=selection.condition_param,
            )
            active_raw = client.active_listings(
                model_id=selection.model_id,
                caliber_id=selection.caliber_id,
                use_parent_model=True,
            )
        except GbaApiError as exc:
            logger.warning("Outdoor Analytics pricing fetch failed: %s", exc)
            return []

        listings: list[MarketListing] = []
        listings.extend(
            _sold_rows_to_listings(sold_raw, selection=selection, title_prefix=title_prefix)
        )
        listings.extend(_active_rows_to_listings(active_raw, selection=selection))

        if query.condition != "any":
            listings = _filter_by_condition(listings, query.condition)

        return listings


def _filter_by_condition(
    listings: list[MarketListing],
    condition: Condition,
) -> list[MarketListing]:
    want = condition.lower()
    if want == "any":
        return listings
    out: list[MarketListing] = []
    for row in listings:
        c = (row.condition or "").lower()
        if want == "new" and c and "new" not in c:
            continue
        if want == "used" and c == "new":
            continue
        out.append(row)
    return out
