"""Canonical gun keys and listing match scoring."""

from __future__ import annotations

import re

from mmd_engine.valuation_models import FirearmQuery, MarketListing

DEFAULT_EXCLUDES = [
    "parts kit",
    "frame only",
    "slide only",
    "barrel only",
    "lot of",
    "parts lot",
    "upper only",
    "lower only",
    "mag only",
    "holster only",
    "penny start",
    "0.01 penny",
]


def canonical_key(query: FirearmQuery) -> str:
    parts = [
        query.category.lower(),
        query.manufacturer.lower(),
        query.model.lower(),
        query.variant.lower(),
        query.caliber.lower(),
        query.condition,
    ]
    return "|".join(p.strip() for p in parts if p.strip())


def build_required_tokens(query: FirearmQuery) -> list[str]:
    """Core match tokens (manufacturer, model, variant) — not caliber."""
    return build_core_tokens(query)


def build_model_aliases(query: FirearmQuery) -> list[str]:
    """Extra title tokens when catalog model codes differ from TGV/GunBroker text."""
    mfr = query.manufacturer.lower()
    mdl = query.model.lower().strip()
    aliases: list[str] = []
    if "bear creek" in mfr or "bca" in mfr:
        if mdl in {"dl", "bc-dl", "bca-dl"}:
            aliases.extend(["bc-10", "bc10", "bca-10", "bca-dl-308", "ar-10", "ar10"])
        if mdl in {"bc-10", "bc10", "bca-10"}:
            aliases.extend(["bc-10", "bc10", "bca-10", "bca-dl"])
    if "savage" in mfr and ("1911" in mdl or "savage 1911" in mdl or mdl == "1911"):
        aliases.extend(["savage-1911", "savage 1911", "sv1911", "sv1911gss"])
    if query.mpn:
        aliases.append(query.mpn.lower())
    if "glock" in mfr:
        mdl_num = re.sub(r"\D", "", mdl)
        if mdl_num:
            aliases.extend([f"g{mdl_num}", f"glock {mdl_num}", f"glock{mdl_num}"])
        variant = (query.variant or "").lower()
        if "gen" in variant and "5" in variant:
            aliases.extend(["gen5", "gen 5", "gen5"])
        if "gen" in variant and "4" in variant:
            aliases.extend(["gen4", "gen 4", "gen4"])
    return list(dict.fromkeys(aliases))


def tgv_canonical_page_slug(query: FirearmQuery) -> str | None:
    """
    Build TGV path like Savage-Arms-Savage-1911-45-ACP from form fields.
    See: /pistol/{slug}/price-historical-value
    """
    mfr = query.manufacturer.strip()
    mdl = query.model.strip()
    cal = query.caliber.strip()
    if not mfr or not mdl:
        return None
    segments: list[str] = [tgv_slug(mfr)]
    model_slug = tgv_slug(mdl)
    mfr_root = mfr.split()[0].lower() if mfr else ""
    if mfr_root and mfr_root not in model_slug.replace("-", ""):
        combined = tgv_slug(f"{mfr_root} {mdl}")
        segments.append(combined or model_slug)
    elif model_slug and model_slug != segments[0]:
        segments.append(model_slug)
    if cal:
        cal_slug = tgv_slug(cal)
        if cal_slug:
            segments.append(cal_slug)
    return "-".join(segments) if len(segments) >= 2 else None


def tgv_model_slugs(query: FirearmQuery) -> list[str]:
    """TrueGunValue model path segments to try (most specific first)."""
    slugs: list[str] = []
    canonical = tgv_canonical_page_slug(query)
    if canonical:
        slugs.append(canonical)
    for alias in build_model_aliases(query):
        slugs.append(tgv_slug(alias))
    slugs.append(tgv_slug(query.model))
    mfr = query.manufacturer.lower()
    mdl = query.model.lower()
    if "savage" in mfr and "1911" in mdl:
        for s in ("savage-1911", "sv1911", "1911"):
            slugs.append(s)
    return list(dict.fromkeys(s for s in slugs if s))


def build_core_tokens(query: FirearmQuery) -> list[str]:
    tokens: list[str] = []
    for value in (query.manufacturer, query.model):
        for part in value.lower().split():
            if len(part) >= 2:
                tokens.append(part)
    if query.variant:
        for part in query.variant.lower().split():
            part = part.strip()
            if len(part) >= 2 or part in {"ii", "iv", "v", "vi", "iii"}:
                tokens.append(part)
    if query.upc:
        tokens.append(query.upc.lower())
    return list(dict.fromkeys(tokens))


def build_caliber_tokens(caliber: str) -> list[str]:
    """Normalized caliber forms; avoids requiring bare '06' from '30 06'."""
    raw = (caliber or "").strip().lower()
    if not raw:
        return []
    forms = [
        raw,
        raw.replace(" ", "-"),
        raw.replace(" ", ""),
        re.sub(r"[^a-z0-9]", "", raw),
    ]
    return list(dict.fromkeys(f for f in forms if len(f) >= 2))


def build_exclude_tokens(query: FirearmQuery) -> list[str]:
    excludes = [t.lower() for t in DEFAULT_EXCLUDES]
    excludes.extend(t.lower() for t in query.exclude_tokens)
    return excludes


def score_listing(listing: MarketListing, query: FirearmQuery) -> float:
    title = listing.title.lower()
    core = build_core_tokens(query)
    caliber_forms = build_caliber_tokens(query.caliber)
    excludes = build_exclude_tokens(query)

    if not core:
        return 0.0

    for ex in excludes:
        if ex in title:
            return 0.0

    mfr = query.manufacturer.lower().strip()
    mdl = query.model.lower().strip()
    if mfr and mfr not in title and not _token_matches_title(mfr, title):
        if not any(_token_matches_title(p, title) for p in mfr.split() if len(p) >= 3):
            return 0.0
    model_ok = not mdl or _token_matches_title(mdl, title)
    if not model_ok:
        model_ok = any(
            alias.replace("-", "") in title.replace("-", "").replace(" ", "")
            for alias in build_model_aliases(query)
        )
    if mdl and not model_ok:
        return 0.0

    if "savage" in mfr and listing.price_type in {"sold", "asking"}:
        if "savage" not in title:
            return 0.0
        if "1911" in mdl and not re.search(
            r"savage\s*1911|sv1911|1911\s*gov", title, re.I
        ):
            return 0.0

    score = 60.0
    matched_core = 0
    for token in core:
        if _token_matches_title(token, title) or (
            listing.upc and token == listing.upc.lower()
        ):
            matched_core += 1
            score += 15.0

    if matched_core < max(2, len(core) - 1):
        return 0.0

    if caliber_forms and any(_caliber_in_title(c, title) for c in caliber_forms):
        score += 20.0

    if query.variant:
        variant_tokens = [
            t
            for t in query.variant.lower().split()
            if len(t) >= 2 or t in {"ii", "iv", "v", "vi", "iii"}
        ]
        if variant_tokens and not any(
            _token_matches_title(t, title) or t in title for t in variant_tokens
        ):
            score -= 25.0

    if caliber_forms and listing.price_type in {"sold", "asking"}:
        if not any(_caliber_in_title(c, title) for c in caliber_forms):
            if mdl == "1911" or "1911" in mdl:
                return 0.0
            score -= 35.0

    if mdl == "1911" and listing.price_type in {"sold", "asking"}:
        if re.search(r"\bmade in 1911\b|\bin 1911\b", title) and not re.search(
            r"45|\.45|1911", title
        ):
            return 0.0

    for alias in build_model_aliases(query):
        if alias.replace("-", "") in title.replace("-", "").replace(" ", ""):
            score += 15.0

    if query.upc and listing.upc and query.upc == listing.upc:
        score += 50.0
    elif query.upc and _upc_in_text(query.upc, title):
        score += 45.0

    if query.condition != "any":
        cond = query.condition.lower()
        listing_cond = (listing.condition or "").lower()
        if cond == "new" and "used" in listing_cond and "new" not in listing_cond:
            score -= 15.0
        if cond == "used" and listing_cond == "new":
            score -= 15.0

    return max(0.0, min(100.0, score))


def _caliber_in_title(caliber_form: str, title: str) -> bool:
    if caliber_form in title:
        return True
    if caliber_form.replace("-", " ") in title:
        return True
    if caliber_form.replace(" ", "") in title.replace(" ", ""):
        return True
    if re.search(r"45\s*acp|\.45\s*acp|\.45\b", title, re.I) and "45" in caliber_form:
        return True
    if caliber_form == "3006" and re.search(r"30\s*[-]?\s*06|\.30\s*06", title, re.I):
        return True
    return False


def apply_matching(
    listings: list[MarketListing],
    query: FirearmQuery,
    *,
    min_score: float = 50.0,
) -> list[MarketListing]:
    scored: list[MarketListing] = []
    for listing in listings:
        listing.match_score = score_listing(listing, query)
        listing.included_in_stats = listing.match_score >= min_score
        scored.append(listing)
    return scored


def is_exact_sku_match(listing: MarketListing, query: FirearmQuery) -> bool:
    """True when listing UPC/MPN/title matches query identifiers."""
    if query.upc and listing.upc and query.upc.strip() == listing.upc.strip():
        return True
    if query.upc and _upc_in_text(query.upc, listing.title):
        return True
    if query.mpn:
        mpn = query.mpn.strip().lower()
        title = listing.title.lower()
        if mpn and (mpn in title or f" {mpn} " in f" {title} "):
            return True
    return False


def _upc_in_text(upc: str, text: str) -> bool:
    needle = re.sub(r"\D", "", upc)
    hay = re.sub(r"\D", "", text)
    return len(needle) >= 8 and needle in hay


def _token_matches_title(token: str, title: str) -> bool:
    if not token:
        return False
    t = title.lower()
    tok = token.lower()
    if tok.isdigit():
        return bool(
            re.search(
                rf"\b{re.escape(tok)}\b|"
                rf"\bmodel\s*{re.escape(tok)}\b|"
                rf"(?<![0-9]){re.escape(tok)}(?![0-9])",
                t,
                re.I,
            )
        )
    return tok in t


def tgv_slug(text: str) -> str:
    slug = text.lower().strip()
    slug = re.sub(r"[^a-z0-9]+", "-", slug)
    return slug.strip("-")
