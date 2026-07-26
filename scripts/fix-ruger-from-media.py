#!/usr/bin/env python3
"""Install clean Ruger logos from ruger.com media resources."""

from __future__ import annotations

import re
import urllib.request
from pathlib import Path
from html.parser import HTMLParser

OUT = Path("/opt/bitnami/wordpress/wp-content/themes/modulargunworks/assets/images/brands")
UA = {
    "User-Agent": "Mozilla/5.0 (compatible; ModularGunWorks/1.0; +https://www.modulargunworks.com)",
    "Accept": "*/*",
}


def http_get(url: str) -> tuple[bytes, str]:
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=60) as resp:
        return resp.read(), (resp.headers.get_content_type() or "")


class LinkCollector(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.hrefs: list[str] = []
        self.imgs: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        ad = {k: (v or "") for k, v in attrs}
        if tag == "a" and ad.get("href"):
            self.hrefs.append(ad["href"])
        if tag == "img" and ad.get("src"):
            self.imgs.append(ad["src"])


def abs_url(base: str, u: str) -> str:
    if u.startswith("//"):
        return "https:" + u
    if u.startswith("/"):
        return "https://www.ruger.com" + u
    if u.startswith("http"):
        return u
    return base.rsplit("/", 1)[0] + "/" + u


def main() -> None:
    pages = [
        "https://www.ruger.com/resources/index.html",
        "https://www.ruger.com/resources/",
        "https://ruger.com/resources/index.html",
    ]
    all_links: list[str] = []
    for page in pages:
        try:
            html, _ = http_get(page)
        except Exception as exc:  # noqa: BLE001
            print(f"fail {page}: {exc}")
            continue
        text = html.decode("utf-8", "replace")
        print(f"OK {page} ({len(text)} chars)")
        parser = LinkCollector()
        parser.feed(text)
        for u in parser.hrefs + parser.imgs:
            all_links.append(abs_url(page, u))
        # also regex for media paths
        all_links.extend(
            abs_url(page, u)
            for u in re.findall(
                r"""["']([^"']+\.(?:png|jpg|jpeg|svg|zip|eps))["']""",
                text,
                flags=re.I,
            )
        )

    # Dedup
    seen: set[str] = set()
    links: list[str] = []
    for u in all_links:
        if u not in seen:
            seen.add(u)
            links.append(u)

    print(f"links={len(links)}")
    logoish = [
        u
        for u in links
        if re.search(r"logo|eagle|pms.?200|linear|stacked|brand", u, re.I)
    ]
    print("logo-ish:")
    for u in logoish:
        print(" ", u)

    # Prefer PNG linear / red / black logo files (not zip)
    candidates = [
        u
        for u in logoish
        if u.lower().endswith((".png", ".svg", ".jpg", ".jpeg"))
        and "zip" not in u.lower()
    ]
    # Rank: red linear png first
    def rank(u: str) -> tuple:
        low = u.lower()
        return (
            0 if "linear" in low else 1,
            0 if "red" in low or "pms" in low else 1,
            0 if low.endswith(".png") else 1,
            0 if "stacked" in low else 1,
            len(u),
        )

    for u in sorted(candidates, key=rank):
        try:
            data, ctype = http_get(u)
        except Exception as exc:  # noqa: BLE001
            print(f"dl fail {u}: {exc}")
            continue
        print(f"got {u} -> {len(data)}b {ctype}")
        if len(data) < 1500:
            continue
        if data.lstrip().startswith(b"<") or "svg" in ctype:
            (OUT / "ruger-source.svg").write_bytes(data)
            print(" saved svg")
            continue
        if data.startswith(b"\x89PNG") or data[:2] == b"\xff\xd8":
            (OUT / "ruger.png").write_bytes(data)
            (OUT / "sturm-ruger-co.png").write_bytes(data)
            print(f"INSTALLED {u}")
            return

    # Try companieslogo CDN as last resort for a clean mark
    fallbacks = [
        "https://companieslogo.com/img/orig/RGR-a1f3f1d0.png?t=1720244492",
        "https://companieslogo.com/img/orig/RGR.D-a1f3f1d0.png?t=1720244492",
        "https://static.cdnlogo.com/logos/s/76/sturm-ruger.svg",
        "https://static.cdnlogo.com/logos/s/76/sturm-ruger.png",
    ]
    print("trying fallbacks")
    for u in fallbacks:
        try:
            data, ctype = http_get(u)
            print(f"fallback {u} -> {len(data)}b {ctype}")
            if data.lstrip().startswith(b"<") or "svg" in ctype:
                (OUT / "ruger-source.svg").write_bytes(data)
                continue
            if len(data) > 1500 and (data.startswith(b"\x89PNG") or data[:2] == b"\xff\xd8"):
                (OUT / "ruger.png").write_bytes(data)
                (OUT / "sturm-ruger-co.png").write_bytes(data)
                print(f"INSTALLED fallback {u}")
                return
        except Exception as exc:  # noqa: BLE001
            print(f"fallback fail {u}: {exc}")

    print("FAILED")


if __name__ == "__main__":
    main()
