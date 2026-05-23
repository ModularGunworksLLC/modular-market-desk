"""Parse listing sold-date strings for 90-day stats windows."""

from __future__ import annotations

import re
from datetime import datetime, timedelta, timezone

_RELATIVE_RE = re.compile(
    r"(\d+)\s*(day|week|month|year)s?\s*ago",
    re.I,
)


def parse_sold_date(raw: str, *, reference: datetime | None = None) -> datetime | None:
    """
    Convert TGV-style dates to UTC datetime.
    Supports ISO strings and relative phrases (e.g. '4 days ago', '1 week ago').
    """
    text = (raw or "").strip()
    if not text:
        return None

    ref = reference or datetime.now(timezone.utc)

    match = _RELATIVE_RE.search(text)
    if match:
        n = int(match.group(1))
        unit = match.group(2).lower()
        if unit == "day":
            delta = timedelta(days=n)
        elif unit == "week":
            delta = timedelta(weeks=n)
        elif unit == "month":
            delta = timedelta(days=n * 30)
        else:
            delta = timedelta(days=n * 365)
        return ref - delta

    try:
        dt = datetime.fromisoformat(text.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except ValueError:
        return None


def sold_date_iso(raw: str, *, reference: datetime | None = None) -> str:
    """ISO string for MarketListing.date, or empty if unknown."""
    dt = parse_sold_date(raw, reference=reference)
    return dt.isoformat() if dt else ""
