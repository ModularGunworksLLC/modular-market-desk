import re
from hashlib import sha1

PRICE_RE = re.compile(r"\$[\d,]+(?:\.\d{2})?")


def slug_id(*parts: str) -> str:
    raw = "-".join(p.strip().lower() for p in parts if p and p.strip())
    return sha1(raw.encode()).hexdigest()[:12]


def parse_price(text: str) -> float | None:
    match = PRICE_RE.search(text or "")
    if not match:
        return None
    return float(match.group().replace("$", "").replace(",", ""))


def matches_query(haystack: str, query: str) -> bool:
    q = query.strip().lower()
    if not q:
        return True
    h = haystack.lower()
    return all(token in h for token in q.split())
