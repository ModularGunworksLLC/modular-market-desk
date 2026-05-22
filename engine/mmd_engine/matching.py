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
    tokens: list[str] = []
    for value in (query.manufacturer, query.model, query.caliber):
        for part in value.lower().split():
            if len(part) >= 2:
                tokens.append(part)
    if query.variant:
        for part in query.variant.lower().split():
            if len(part) >= 2:
                tokens.append(part)
    if query.upc:
        tokens.append(query.upc.lower())
    return list(dict.fromkeys(tokens))


def build_exclude_tokens(query: FirearmQuery) -> list[str]:
    excludes = [t.lower() for t in DEFAULT_EXCLUDES]
    excludes.extend(t.lower() for t in query.exclude_tokens)
    return excludes


def score_listing(listing: MarketListing, query: FirearmQuery) -> float:
    title = listing.title.lower()
    required = build_required_tokens(query)
    excludes = build_exclude_tokens(query)

    if not required:
        return 0.0

    for ex in excludes:
        if ex in title:
            return 0.0

    score = 0.0
    matched = 0
    for token in required:
        if token in title or (listing.upc and token == listing.upc.lower()):
            matched += 1
            score += 40.0

    if matched < max(2, len(required) - 1):
        return 0.0

    if query.variant:
        variant_tokens = [t for t in query.variant.lower().split() if len(t) >= 2]
        if variant_tokens and not any(t in title for t in variant_tokens):
            score -= 25.0

    if query.upc and listing.upc and query.upc == listing.upc:
        score += 50.0

    if query.condition != "any":
        cond = query.condition.lower()
        listing_cond = (listing.condition or "").lower()
        if cond == "new" and "used" in listing_cond and "new" not in listing_cond:
            score -= 15.0
        if cond == "used" and listing_cond == "new":
            score -= 15.0

    return max(0.0, min(100.0, score))


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


def tgv_slug(text: str) -> str:
    slug = text.lower().strip()
    slug = re.sub(r"[^a-z0-9]+", "-", slug)
    return slug.strip("-")
