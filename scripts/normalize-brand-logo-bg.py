#!/usr/bin/env python3
"""Normalize logo backgrounds for light brand tiles."""

from __future__ import annotations

from pathlib import Path

OUT = Path("/opt/bitnami/wordpress/wp-content/themes/modulargunworks/assets/images/brands")


def normalize(path: Path, black_threshold: int = 28, bright_threshold: int = 200) -> None:
    from PIL import Image

    im = Image.open(path).convert("RGBA")
    pixels = im.load()
    w, h = im.size

    nonblack = 0
    bright = 0
    for y in range(h):
        for x in range(w):
            r, g, b, a = pixels[x, y]
            if a < 10:
                continue
            if r <= black_threshold and g <= black_threshold and b <= black_threshold:
                continue
            nonblack += 1
            if (r + g + b) / 3 >= bright_threshold:
                bright += 1

    if nonblack == 0:
        print(f"  skip empty {path.name}")
        return

    bright_ratio = bright / nonblack
    # White / light logos need the black plate kept (else vanish on #f5f6f7 tiles).
    if bright_ratio >= 0.45:
        print(f"  keep black plate {path.name} (bright={bright_ratio:.2f})")
        return

    changed = 0
    for y in range(h):
        for x in range(w):
            r, g, b, a = pixels[x, y]
            if r <= black_threshold and g <= black_threshold and b <= black_threshold:
                pixels[x, y] = (0, 0, 0, 0)
                changed += 1
    im.save(path, "PNG")
    print(f"  transparentized {path.name} changed={changed} bright={bright_ratio:.2f}")


def main() -> None:
    try:
        import PIL  # noqa: F401
    except Exception:
        import subprocess
        import sys

        print("Installing Pillow…")
        subprocess.check_call([sys.executable, "-m", "pip", "install", "--quiet", "Pillow"])

    for name in (
        "magpul.png",
        "magpul-accessories.png",
        "blue-force-gear.png",
        "iwi-us-israel-weapon-industries.png",
        "iwi.png",
        "ruger.png",
        "sturm-ruger-co.png",
    ):
        path = OUT / name
        if path.exists():
            print(f"== {name}")
            normalize(path)


if __name__ == "__main__":
    main()
