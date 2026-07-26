#!/usr/bin/env python3
"""Replace bad brand logos with known-good Wikimedia / official assets."""

from __future__ import annotations

import json
import ssl
import subprocess
import urllib.parse
import urllib.request
from pathlib import Path

OUT = Path("/opt/bitnami/wordpress/wp-content/themes/modulargunworks/assets/images/brands")
UA = "ModularGunworksLogoFix/1.0 (merchant brand display; contact=info@modulargunworks.com)"
CTX = ssl.create_default_context()

# Explicit Wikimedia Commons filenames (or direct HTTPS URLs).
# These are used for nominative product-brand identification on a dealer site.
TARGETS = {
    # Magpul wordmark / logo
    "magpul.png": "File:Magpul Industries logo.svg",
    "magpul-accessories.png": "File:Magpul Industries logo.svg",
    # Ruger eagle / wordmark
    "ruger.png": "File:Sturm Ruger logo.svg",
    "sturm-ruger-co.png": "File:Sturm Ruger logo.svg",
    # Blue Force Gear — try commons; fallback URL list below
    "blue-force-gear.png": "File:Blue Force Gear logo.png",
    # IWI
    "iwi-us-israel-weapon-industries.png": "File:Israel Weapon Industries logo.svg",
}

FALLBACK_URLS = {
    "blue-force-gear.png": [
        # Brand site apple-touch / og images sometimes work; prefer vector-ish PNG
        "https://www.blueforcegear.com/static/version/frontend/BlueForceGear/default/en_US/Magento_Theme/favicon.ico",
    ],
    "magpul.png": [
        "https://upload.wikimedia.org/wikipedia/commons/thumb/8/8a/Magpul_Industries_logo.svg/512px-Magpul_Industries_logo.svg.png",
    ],
    "ruger.png": [
        "https://upload.wikimedia.org/wikipedia/en/thumb/8/8e/Sturm_Ruger_logo.svg/512px-Sturm_Ruger_logo.svg.png",
    ],
}


def http_get(url: str) -> bytes | None:
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "*/*"})
    try:
        with urllib.request.urlopen(req, context=CTX, timeout=30) as resp:
            data = resp.read()
            if len(data) < 200:
                return None
            return data
    except Exception as exc:  # noqa: BLE001
        print(f"  fail {url}: {exc}")
        return None


def commons_thumb(file_title: str, width: int = 512) -> str | None:
    q = urllib.parse.urlencode(
        {
            "action": "query",
            "titles": file_title,
            "prop": "imageinfo",
            "iiprop": "url",
            "iiurlwidth": str(width),
            "format": "json",
        }
    )
    raw = http_get(f"https://commons.wikimedia.org/w/api.php?{q}")
    if not raw:
        # try en.wikipedia
        raw = http_get(f"https://en.wikipedia.org/w/api.php?{q}")
    if not raw:
        return None
    data = json.loads(raw.decode("utf-8", "replace"))
    pages = data.get("query", {}).get("pages", {})
    for page in pages.values():
        infos = page.get("imageinfo") or []
        if not infos:
            continue
        info = infos[0]
        return info.get("thumburl") or info.get("url")
    return None


def save_png(path: Path, data: bytes) -> bool:
    # If SVG, convert via rsvg/inkscape/convert if available; else skip
    if data.lstrip().startswith(b"<") or b"<svg" in data[:500].lower():
        tmp = path.with_suffix(".svg")
        tmp.write_bytes(data)
        # try convert
        for cmd in (
            ["convert", "-background", "none", str(tmp), "-resize", "512x512", str(path)],
            ["rsvg-convert", "-w", "512", "-o", str(path), str(tmp)],
        ):
            try:
                subprocess.run(cmd, check=True, capture_output=True)
                if path.is_file() and path.stat().st_size > 200:
                    tmp.unlink(missing_ok=True)
                    print(f"  converted svg -> {path.name}")
                    return True
            except Exception:
                continue
        print(f"  svg saved but could not convert: {tmp.name}")
        return False

    # jpeg/png/webp
    if data[:3] == b"GIF" or data[:2] == b"\xff\xd8":
        # write temp and convert to png
        tmp = path.with_suffix(".srcbin")
        tmp.write_bytes(data)
        try:
            subprocess.run(
                ["convert", str(tmp), "-resize", "512x512>", str(path)],
                check=True,
                capture_output=True,
            )
            tmp.unlink(missing_ok=True)
            print(f"  saved {path.name}")
            return path.is_file()
        except Exception:
            path.write_bytes(data)
            tmp.unlink(missing_ok=True)
            print(f"  saved raw {path.name}")
            return True

    path.write_bytes(data)
    print(f"  wrote {path.name} ({len(data)} bytes)")
    return True


def search_commons(query: str) -> str | None:
    q = urllib.parse.urlencode(
        {
            "action": "query",
            "list": "search",
            "srsearch": query,
            "srnamespace": "6",  # File
            "srlimit": "8",
            "format": "json",
        }
    )
    raw = http_get(f"https://commons.wikimedia.org/w/api.php?{q}")
    if not raw:
        return None
    data = json.loads(raw.decode("utf-8", "replace"))
    for hit in data.get("query", {}).get("search", []):
        title = hit.get("title") or ""
        low = title.lower()
        if "logo" in low or "wordmark" in low:
            return title
    # first file hit
    hits = data.get("query", {}).get("search", [])
    return hits[0]["title"] if hits else None


def fetch_one(dest_name: str, file_title: str) -> bool:
    print(f"== {dest_name} <={file_title}")
    url = commons_thumb(file_title)
    data = http_get(url) if url else None
    if not data:
        # search
        q = file_title.replace("File:", "").replace("_", " ")
        found = search_commons(q + " logo")
        if found:
            print(f"  search hit: {found}")
            url = commons_thumb(found)
            data = http_get(url) if url else None
    if not data:
        for fb in FALLBACK_URLS.get(dest_name, []):
            print(f"  fallback {fb}")
            data = http_get(fb)
            if data:
                break
    if not data:
        print("  FAILED")
        return False
    path = OUT / dest_name
    # remove wrong jpg sibling for blue-force-gear
    if dest_name.startswith("blue-force-gear"):
        (OUT / "blue-force-gear.jpg").unlink(missing_ok=True)
    return save_png(path, data)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    # Prefer ImageMagick
    try:
        subprocess.run(["convert", "-version"], check=True, capture_output=True)
    except Exception:
        print("WARN: ImageMagick convert not found — SVG conversion may fail")

    ok = 0
    for dest, title in TARGETS.items():
        if fetch_one(dest, title):
            ok += 1

    # Extra high-value fixes via search
    extras = {
        "blackhawk.png": "Blackhawk logo firearms OR BlackHawk Products logo",
        "burris.png": "Burris Optics logo",
        "burris-company-inc.png": "Burris Optics logo",
        "fn-usa.png": "FN Herstal logo OR FN America logo",
        "glock-inc.png": "Glock logo",
        "walther-arms.png": "Walther Arms logo",
        "q-llc.png": "Q LLC firearms logo",
        "weatherby.png": "Weatherby logo",
        "daniel-defense.png": "Daniel Defense logo",
        "beretta-u-s-a.png": "Beretta logo",
        "colt-manufacturing.png": "Colt Manufacturing logo",
        "cz-usa-firearms.png": "CZ firearms logo",
        "sig-sauer.png": "SIG Sauer logo",
        "leupold-stevens-inc.png": "Leupold logo",
        "yankee-hill.png": "Yankee Hill Machine logo",
        "athlon.png": "Athlon Optics logo",
        "bt-usa.png": "B&T firearms logo",
    }
    for dest, query in extras.items():
        print(f"== search {dest}")
        found = search_commons(query)
        if not found:
            print("  no commons hit")
            continue
        url = commons_thumb(found)
        data = http_get(url) if url else None
        if not data:
            print("  download failed")
            continue
        if save_png(OUT / dest, data):
            ok += 1
            # drop bad jpg duplicates for fn-usa
            if dest.startswith("fn-usa"):
                (OUT / "fn-usa.jpg").unlink(missing_ok=True)
            if dest.startswith("glock-inc"):
                (OUT / "glock-inc.jpg").unlink(missing_ok=True)

    print(f"done ok={ok}")


if __name__ == "__main__":
    main()
