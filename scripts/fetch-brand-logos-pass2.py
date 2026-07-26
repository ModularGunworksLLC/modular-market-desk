#!/usr/bin/env python3
"""Second pass: fetch logos for all brands with products > 0 still missing files."""

from __future__ import annotations

import json
import re
import ssl
import time
import urllib.parse
import urllib.request
from pathlib import Path

OUT = Path("/opt/bitnami/wordpress/wp-content/themes/modulargunworks/assets/images/brands")
UA = "ModularGunworksBrandBot/1.0 (local shop logo cache; contact=info@modulargunworks.com)"
CTX = ssl.create_default_context()
BRANDS = Path("/tmp/active-brands.tsv")


def http_get(url: str, timeout: int = 20) -> bytes | None:
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "*/*"})
    try:
        with urllib.request.urlopen(req, context=CTX, timeout=timeout) as resp:
            return resp.read()
    except Exception:
        return None


def wiki_thumb(title: str) -> str | None:
    q = urllib.parse.urlencode(
        {
            "action": "query",
            "titles": title,
            "prop": "pageimages",
            "format": "json",
            "pithumbsize": "400",
            "redirects": "1",
            "pilicense": "any",
        }
    )
    raw = http_get(f"https://en.wikipedia.org/w/api.php?{q}")
    if not raw:
        return None
    data = json.loads(raw.decode("utf-8", "replace"))
    for page in data.get("query", {}).get("pages", {}).values():
        if "missing" in page:
            continue
        thumb = page.get("thumbnail", {}).get("source")
        if thumb:
            return thumb
    return None


def clean_name(name: str) -> str:
    name = re.sub(r"&amp;", "&", name)
    name = re.sub(
        r"\b(LLC|Inc\.?|Corp\.?|Company|Co\.|Ltd\.?|USA|U\.S\.A\.|International|Firearms|Arms|DBA|dba)\b",
        "",
        name,
        flags=re.I,
    )
    return re.sub(r"\s+", " ", name).strip(" -,&/")


def has_logo(slug: str) -> bool:
    return any((OUT / f"{slug}.{ext}").is_file() for ext in ("png", "jpg", "jpeg", "webp", "svg", "gif"))


def save_image(slug: str, data: bytes) -> None:
    ext = "png"
    if data[:3] == b"GIF":
        ext = "gif"
    elif data[:2] == b"\xff\xd8":
        ext = "jpg"
    elif data[:4] == b"\x89PNG":
        ext = "png"
    elif data[:4] == b"RIFF" and b"WEBP" in data[:16]:
        ext = "webp"
    (OUT / f"{slug}.{ext}").write_bytes(data)
    print(f"  saved {slug}.{ext} ({len(data)})")


def main() -> None:
    rows = []
    for line in BRANDS.read_text(encoding="utf-8").splitlines():
        parts = line.split("\t")
        if len(parts) < 3:
            continue
        count = int(parts[0])
        if count <= 0:
            continue
        rows.append((count, parts[1], parts[2]))

    done = failed = skipped = 0
    for count, slug, name in rows:
        if has_logo(slug):
            skipped += 1
            continue
        print(f"[{count}] {slug}")
        title = clean_name(name)
        thumb = wiki_thumb(title) if title else None
        data = http_get(thumb) if thumb else None
        if data and len(data) > 800:
            save_image(slug, data)
            done += 1
        else:
            print("  miss")
            failed += 1
        time.sleep(0.25)
    print(f"done downloaded={done} skipped={skipped} failed={failed}")


if __name__ == "__main__":
    main()
