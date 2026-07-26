#!/usr/bin/env python3
"""Download brand logos for top pa_brand terms via Wikipedia pageimages + known domains."""

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

# Explicit Wikipedia titles / Wikimedia filenames for awkward brand names
WIKI_TITLES = {
    "rcbs": "RCBS",
    "leupold-stevens-inc": "Leupold & Stevens",
    "sig-sauer": "SIG Sauer",
    "redding-reloading-equipment": "Redding Reloading Equipment",
    "sturm-ruger-co": "Ruger",
    "sierra-bullets": "Sierra Bullets",
    "smith-wesson-inc": "Smith & Wesson",
    "taurus-international-inc": "Taurus (firearms)",
    "browning-clothing": "Browning Arms Company",
    "springfield-armory": "Springfield Armory, Inc.",
    "streamlight": "Streamlight",
    "cz-usa-firearms": "Česká zbrojovka Uherský Brod",
    "heckler-koch-inc": "Heckler & Koch",
    "fn-usa": "FN Herstal",
    "colt-manufacturing": "Colt's Manufacturing Company",
    "aero-precision": "Aero Precision",
    "remington-firearms": "Remington Arms",
    "magpul-accessories": "Magpul",
    "barrett-firearms": "Barrett Firearms Manufacturing",
    "walther-arms": "Walther Arms",
    "silencerco": "SilencerCo",
    "daniel-defense": "Daniel Defense",
    "glock-inc": "Glock",
    "beretta-u-s-a": "Beretta",
    "kimber": "Kimber Manufacturing",
    "hornady-reloading": "Hornady",
    "burris-company-inc": "Burris Company",
    "bushnell": "Bushnell Corporation",
    "mossberg": "Mossberg & Sons",
    "holosun": "Holosun",
    "surefire": "SureFire",
    "wilson-combat": "Wilson Combat",
    "yankee-hill-machine": "Yankee Hill Machine",
    "iwi-us-israel-weapon-industries": "Israel Weapon Industries",
    "dead-air-silencers": "Dead Air Silencers",
    "sb-tactical": "SB Tactical",
    "timney-triggers": "Timney Triggers",
    "safariland-safariland": "Safariland",
    "umarex-usa": "Umarex",
    "thompson-center-arms": "Thompson/Center Arms",
    "diamondback": "Diamondback Firearms",
    "radical-firearms": "Radical Firearms",
    "christensen-arms": "Christensen Arms",
    "cmmg-inc": "CMMG",
    "century-arms": "Century International Arms",
    "crimson-trace-corporation": "Crimson Trace",
    "federal": "Federal Premium Ammunition",
    "cci": "CCI (ammunition)",
    "speer": "Speer Bullets",
    "nosler": "Nosler",
    "alliant-powder": "Alliant Powder",
    "barnes-bullets": "Barnes Bullets",
    "bergara-rifles": "Bergara",
    "bersa-usa": "Bersa",
    "bond-arms-inc": "Bond Arms",
    "bushmaster-firearms-inc": "Bushmaster Firearms International",
    "charter-arms": "Charter Arms",
    "chiappa-firearms-usa-ltd": "Chiappa Firearms",
    "armalite": "ArmaLite",
    "anderson-manufacturing": "Anderson Manufacturing",
    "primary-arms": "Primary Arms",
    "vortex-optics": "Vortex Optics",
    "trijicon": "Trijicon",
    "aimpoint": "Aimpoint",
    "eotech": "EOTech",
    "nightforce": "Nightforce",
    "zeiss": "Carl Zeiss AG",
    "swarovski": "Swarovski",
}

# Official domains for logo.dev/favicon fallback when wiki fails
DOMAINS = {
    "rcbs": "rcbs.com",
    "leupold-stevens-inc": "leupold.com",
    "sig-sauer": "sigsauer.com",
    "redding-reloading-equipment": "redding-reloading.com",
    "sturm-ruger-co": "ruger.com",
    "sierra-bullets": "sierrabullets.com",
    "smith-wesson-inc": "smith-wesson.com",
    "taurus-international-inc": "taurususa.com",
    "browning-clothing": "browning.com",
    "springfield-armory": "springfield-armory.com",
    "primos": "primos.com",
    "streamlight": "streamlight.com",
    "cz-usa-firearms": "cz-usa.com",
    "pro-shot-products": "proshotproducts.com",
    "heckler-koch-inc": "hk-usa.com",
    "fn-usa": "fnamerica.com",
    "colt-manufacturing": "colt.com",
    "aero-precision": "aeroprecisionusa.com",
    "remington-firearms": "remarms.com",
    "magpul-accessories": "magpul.com",
    "barrett-firearms": "barrett.net",
    "walther-arms": "waltherarms.com",
    "silencerco": "silencerco.com",
    "daniel-defense": "danieldefense.com",
    "glock-inc": "glock.com",
    "beretta-u-s-a": "beretta.com",
    "kimber": "kimberamerica.com",
    "hornady-reloading": "hornady.com",
    "burris-company-inc": "burrisoptics.com",
    "bushnell": "bushnell.com",
    "holosun": "holosun.com",
    "surefire": "surefire.com",
    "wilson-combat": "wilsoncombat.com",
    "safariland-safariland": "safariland.com",
    "umarex-usa": "umarexusa.com",
    "iwi-us-israel-weapon-industries": "iwi.us",
    "dead-air-silencers": "deadairsilencers.com",
    "sb-tactical": "sb-tactical.com",
    "timney-triggers": "timneytriggers.com",
    "federal": "federalpremium.com",
    "cci": "cci-ammunition.com",
    "speer": "speer.com",
    "nosler": "nosler.com",
    "vortex-optics": "vortexoptics.com",
    "trijicon": "trijicon.com",
    "aimpoint": "aimpoint.com",
    "eotech": "eotechinc.com",
}


def http_get(url: str, timeout: int = 20) -> bytes | None:
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "*/*"})
    try:
        with urllib.request.urlopen(req, context=CTX, timeout=timeout) as resp:
            if getattr(resp, "status", 200) >= 400:
                return None
            return resp.read()
    except Exception as exc:  # noqa: BLE001
        print(f"  get fail {url}: {exc}")
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
    pages = data.get("query", {}).get("pages", {})
    for page in pages.values():
        if "missing" in page:
            continue
        thumb = page.get("thumbnail", {}).get("source")
        if thumb:
            return thumb
    return None


def clean_name(name: str) -> str:
    name = re.sub(r"&amp;", "&", name)
    name = re.sub(
        r"\b(LLC|Inc\.?|Corp\.?|Company|Co\.|Ltd\.?|USA|U\.S\.A\.|International|Firearms|Arms)\b",
        "",
        name,
        flags=re.I,
    )
    name = re.sub(r"\s+", " ", name).strip(" -,&")
    return name


def save_image(slug: str, data: bytes, content_hint: str = "") -> bool:
    # Detect type
    ext = "png"
    if data[:3] == b"GIF":
        ext = "gif"
    elif data[:2] == b"\xff\xd8":
        ext = "jpg"
    elif data[:4] == b"\x89PNG":
        ext = "png"
    elif data[:4] == b"RIFF" and b"WEBP" in data[:16]:
        ext = "webp"
    elif b"<svg" in data[:200].lower():
        ext = "svg"
    elif "icon" in content_hint:
        ext = "png"
    path = OUT / f"{slug}.{ext}"
    # Prefer png overwrite of letter placeholders only if new
    path.write_bytes(data)
    print(f"  saved {path.name} ({len(data)} bytes)")
    return True


def has_logo(slug: str) -> bool:
    for ext in ("png", "jpg", "jpeg", "webp", "svg", "gif"):
        if (OUT / f"{slug}.{ext}").is_file():
            return True
    return False


def fetch_favicon(domain: str) -> bytes | None:
    # Google s2 favicons — better than letter placeholders
    url = f"https://www.google.com/s2/favicons?domain={urllib.parse.quote(domain)}&sz=128"
    return http_get(url)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    # Top brands list from WP (precomputed via php dump file if present)
    brands_path = Path("/tmp/top-brands.tsv")
    if not brands_path.exists():
        raise SystemExit("missing /tmp/top-brands.tsv")
    rows = []
    for line in brands_path.read_text(encoding="utf-8").splitlines():
        parts = line.split("\t")
        if len(parts) < 3:
            continue
        count, slug, name = int(parts[0]), parts[1], parts[2]
        rows.append((count, slug, name))

    # Also ensure every existing alias target is kept; focus on missing among top 120
    done = 0
    skipped = 0
    failed = 0
    for count, slug, name in rows[:120]:
        if has_logo(slug):
            skipped += 1
            continue
        # Also skip if an alias file already covers via common names — still want slug file for resolver simplicity
        print(f"[{count}] {slug} ({name})")
        title = WIKI_TITLES.get(slug) or clean_name(name)
        thumb = wiki_thumb(title) if title else None
        data = http_get(thumb) if thumb else None
        if data and len(data) > 500:
            save_image(slug, data)
            done += 1
            time.sleep(0.35)
            continue
        domain = DOMAINS.get(slug)
        if domain:
            fav = fetch_favicon(domain)
            if fav and len(fav) > 200:
                save_image(slug, fav)
                done += 1
                time.sleep(0.2)
                continue
        print("  no logo found")
        failed += 1
        time.sleep(0.2)

    print(f"done downloaded={done} skipped_existing={skipped} failed={failed}")


if __name__ == "__main__":
    main()
