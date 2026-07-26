#!/usr/bin/env python3
"""Replace incorrect key brand logos (Magpul, Ruger, IWI, etc.)."""

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
        ctype = resp.headers.get_content_type() or ""
        return resp.read(), ctype


def wiki_file_url(wiki: str, title: str, width: int | None = None) -> tuple[str, dict]:
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
        raise RuntimeError(f"no imageinfo for {title} on {wiki}")
    return (info.get("thumburl") or info["url"]), info


def write_logo(name: str, data: bytes) -> None:
    path = OUT / name
    path.write_bytes(data)
    print(f"  wrote {name} ({len(data)} bytes)")


def fix_magpul() -> None:
    print("== Magpul")
    url, info = wiki_file_url("en.wikipedia.org", "File:Magpul logo.png")
    print(f"  source {info.get('mime')} {info.get('size')} {url}")
    data, _ = http_get(url)
    write_logo("magpul.png", data)
    write_logo("magpul-accessories.png", data)


def fix_ruger() -> None:
    print("== Ruger")
    url, info = wiki_file_url(
        "commons.wikimedia.org", "File:Ruger Grip Logo transparent.png"
    )
    print(f"  source {info.get('mime')} {info.get('size')} {url}")
    data, _ = http_get(url)
    write_logo("ruger.png", data)
    write_logo("sturm-ruger-co.png", data)


def fix_iwi() -> None:
    print("== IWI")
    html, _ = http_get("https://iwi.us/")
    text = html.decode("utf-8", "replace")
    found: list[str] = []
    patterns = [
        r"""(?:src|href)=["']([^"']*(?:logo|Logo|brand)[^"']*)["']""",
        r"""https?://[^"'\\s>]+(?:logo|Logo)[^"'\\s>]*""",
        r"""<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']""",
        r"""<link[^>]+rel=["'](?:icon|apple-touch-icon)["'][^>]+href=["']([^"']+)["']""",
        r"""["'](https?://[^"']+/wp-content/uploads/[^"']+\.(?:png|svg|webp|jpg))["']""",
    ]
    for pat in patterns:
        found.extend(re.findall(pat, text, flags=re.I))

    uniq: list[str] = []
    seen: set[str] = set()
    for u in found:
        if u.startswith("//"):
            u = "https:" + u
        elif u.startswith("/"):
            u = "https://iwi.us" + u
        if u not in seen:
            seen.add(u)
            uniq.append(u)

    print(f"  scraped {len(uniq)} candidates")
    for u in uniq[:40]:
        print(f"   - {u}")

    # Prefer explicit logo asset names over icons/og lifestyle images.
    ranked = sorted(
        uniq,
        key=lambda u: (
            0 if re.search(r"logo", u, re.I) else 1,
            0 if u.lower().endswith((".png", ".svg", ".webp")) else 1,
            0 if "favicon" not in u.lower() else 1,
            len(u),
        ),
    )

    for u in ranked:
        low = u.lower()
        if not any(low.endswith(ext) for ext in (".png", ".svg", ".webp", ".jpg", ".jpeg")):
            continue
        if "favicon" in low and "logo" not in low:
            continue
        try:
            data, ctype = http_get(u)
        except Exception as exc:  # noqa: BLE001
            print(f"  fail {u}: {exc}")
            continue
        print(f"  try {u} -> {len(data)}b {ctype}")
        if len(data) < 1500:
            continue
        if "svg" in ctype or data.lstrip().startswith(b"<"):
            # Keep SVG only if we have no PNG; brands CSS expects raster usually.
            svg_path = OUT / "iwi-us-israel-weapon-industries.svg"
            svg_path.write_bytes(data)
            print(f"  saved svg {svg_path.name}")
            continue
        if "png" in ctype or data.startswith(b"\x89PNG") or "jpeg" in ctype or "webp" in ctype:
            write_logo("iwi-us-israel-weapon-industries.png", data)
            # Also alias short slug if present on disk
            write_logo("iwi.png", data)
            return

    # Last-resort: known CDN / press paths
    for u in (
        "https://iwi.us/cdn/shop/files/IWI_US_Logo.png",
        "https://iwi.us/cdn/shop/files/iwi-logo.png",
        "https://cdn.shopify.com/s/files/1/0559/0733/files/IWI_Logo.png",
    ):
        try:
            data, ctype = http_get(u)
            print(f"  fallback {u} -> {len(data)}b {ctype}")
            if len(data) > 1500 and data.startswith(b"\x89PNG"):
                write_logo("iwi-us-israel-weapon-industries.png", data)
                write_logo("iwi.png", data)
                return
        except Exception as exc:  # noqa: BLE001
            print(f"  fallback fail {u}: {exc}")

    print("  FAILED to find IWI logo")


def fix_blue_force_confirm() -> None:
    """Keep Wikipedia Blue Force Gear org logo (correct mark + Always Better)."""
    print("== Blue Force Gear (confirm)")
    path = OUT / "blue-force-gear.png"
    if path.exists() and path.stat().st_size > 5000:
        print(f"  keep existing ({path.stat().st_size} bytes)")
        (OUT / "blue-force-gear.jpg").unlink(missing_ok=True)
        return
    url, info = wiki_file_url(
        "commons.wikimedia.org", "File:Blue-Force-Gear-Organization-logo.png", width=800
    )
    print(f"  source {info.get('size')} {url}")
    data, _ = http_get(url)
    write_logo("blue-force-gear.png", data)
    (OUT / "blue-force-gear.jpg").unlink(missing_ok=True)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    fix_magpul()
    fix_ruger()
    fix_blue_force_confirm()
    fix_iwi()
    print("done")


if __name__ == "__main__":
    main()
