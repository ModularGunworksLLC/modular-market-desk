#!/usr/bin/env python3
"""Find and install a clean digital Ruger eagle logo (not grip photo)."""

from __future__ import annotations

import json
import re
import urllib.parse
import urllib.request
from pathlib import Path

OUT = Path("/opt/bitnami/wordpress/wp-content/themes/modulargunworks/assets/images/brands")
UA = {
    "User-Agent": "Mozilla/5.0 (compatible; ModularGunWorks/1.0; +https://www.modulargunworks.com)",
    "Accept": "*/*",
}


def http_get(url: str) -> tuple[bytes, str]:
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=45) as resp:
        return resp.read(), (resp.headers.get_content_type() or "")


def wiki_search(wiki: str, query: str) -> list[str]:
    q = urllib.parse.urlencode(
        {
            "action": "query",
            "list": "search",
            "srsearch": query,
            "srnamespace": "6",
            "srlimit": "20",
            "format": "json",
        }
    )
    req = urllib.request.Request(f"https://{wiki}/w/api.php?{q}", headers=UA)
    data = json.load(urllib.request.urlopen(req, timeout=30))
    return [h["title"] for h in data.get("query", {}).get("search", [])]


def wiki_url(wiki: str, title: str, width: int | None = None) -> tuple[str, dict]:
    params: dict[str, str] = {
        "action": "query",
        "titles": title,
        "prop": "imageinfo",
        "iiprop": "url|mime|size",
        "format": "json",
    }
    if width:
        params["iiurlwidth"] = str(width)
    q = urllib.parse.urlencode(params)
    req = urllib.request.Request(f"https://{wiki}/w/api.php?{q}", headers=UA)
    data = json.load(urllib.request.urlopen(req, timeout=30))
    page = next(iter(data["query"]["pages"].values()))
    info = (page.get("imageinfo") or [None])[0]
    if not info:
        raise RuntimeError(title)
    return (info.get("thumburl") or info["url"]), info


def scrape_logos(page_url: str, base: str) -> list[str]:
    html, _ = http_get(page_url)
    text = html.decode("utf-8", "replace")
    found = re.findall(
        r"""["']([^"']*(?:logo|Logo|brand|eagle)[^"']*\.(?:png|svg|webp|jpg|jpeg))["']""",
        text,
        flags=re.I,
    )
    out: list[str] = []
    seen: set[str] = set()
    for u in found:
        if u.startswith("//"):
            u = "https:" + u
        elif u.startswith("/"):
            u = base.rstrip("/") + u
        if u not in seen:
            seen.add(u)
            out.append(u)
    return out


def looks_like_photo(data: bytes) -> bool:
    # Heuristic: large JPEG-ish photos; prefer smaller clean PNGs.
    if data[:2] == b"\xff\xd8":
        return True
    return False


def install(data: bytes, label: str) -> None:
    (OUT / "ruger.png").write_bytes(data)
    (OUT / "sturm-ruger-co.png").write_bytes(data)
    print(f"INSTALLED from {label} ({len(data)} bytes)")


def main() -> None:
    print("== commons/en search")
    titles: list[tuple[str, str]] = []
    for wiki in ("commons.wikimedia.org", "en.wikipedia.org"):
        for q in (
            "Ruger logo",
            "Sturm Ruger logo",
            "Ruger eagle",
            "File:Ruger",
        ):
            for t in wiki_search(wiki, q):
                titles.append((wiki, t))
                print(f"  {wiki}: {t}")

    # Prefer non-photo digital assets
    preferred_names = (
        "logo.svg",
        "logo.png",
        "wordmark",
        "Ruger_logo",
        "Sturm_Ruger",
    )
    ranked = sorted(
        titles,
        key=lambda wt: (
            0 if any(p.lower() in wt[1].lower() for p in preferred_names) else 1,
            0 if "grip" not in wt[1].lower() else 2,
            0 if "transparent" in wt[1].lower() else 1,
            len(wt[1]),
        ),
    )

    for wiki, title in ranked:
        low = title.lower()
        if "grip" in low and "logo" in low:
            # skip photographic grip medallions
            continue
        if not any(x in low for x in ("logo", "wordmark", "eagle", "ruger")):
            continue
        try:
            url, info = wiki_url(wiki, title, width=600)
        except Exception as exc:  # noqa: BLE001
            print(f"  skip {title}: {exc}")
            continue
        mime = (info.get("mime") or "").lower()
        print(f"  try {title} mime={mime} size={info.get('size')} {url}")
        try:
            data, ctype = http_get(url)
        except Exception as exc:  # noqa: BLE001
            print(f"  dl fail: {exc}")
            continue
        if looks_like_photo(data):
            print("  skip jpeg photo")
            continue
        if "svg" in mime or data.lstrip().startswith(b"<"):
            print("  svg — save raw and continue looking for png")
            (OUT / "ruger-source.svg").write_bytes(data)
            continue
        if data.startswith(b"\x89PNG") and len(data) > 3000:
            # Avoid tiny stubs
            install(data, title)
            return

    print("== scrape ruger.com")
    for page, base in (
        ("https://www.ruger.com/", "https://www.ruger.com"),
        ("https://ruger.com/", "https://ruger.com"),
        ("https://shopruger.com/", "https://shopruger.com"),
    ):
        try:
            logos = scrape_logos(page, base)
        except Exception as exc:  # noqa: BLE001
            print(f"  page fail {page}: {exc}")
            continue
        print(f"  {page} -> {len(logos)} logo-ish urls")
        for u in logos:
            print(f"   - {u}")
            try:
                data, ctype = http_get(u)
            except Exception as exc:  # noqa: BLE001
                print(f"     fail {exc}")
                continue
            print(f"     {len(data)}b {ctype}")
            if looks_like_photo(data):
                continue
            if data.startswith(b"\x89PNG") and len(data) > 2000:
                install(data, u)
                return
            if "svg" in ctype or data.lstrip().startswith(b"<"):
                (OUT / "ruger-source.svg").write_bytes(data)
                print("     saved svg")

    # Last resort: keep previous clean red eagle if we can find a known good CDN.
    # Simple Brands of the World / logo archives are unreliable; try Wikipedia page image list.
    print("== en.wikipedia Sturm, Ruger & Co. images")
    q = urllib.parse.urlencode(
        {
            "action": "query",
            "titles": "Sturm, Ruger & Co.",
            "prop": "images",
            "imlimit": "50",
            "format": "json",
        }
    )
    req = urllib.request.Request(f"https://en.wikipedia.org/w/api.php?{q}", headers=UA)
    data = json.load(urllib.request.urlopen(req, timeout=30))
    page = next(iter(data["query"]["pages"].values()))
    for img in page.get("images", []):
        print(" ", img["title"])

    print("FAILED to find clean Ruger digital logo")


if __name__ == "__main__":
    main()
