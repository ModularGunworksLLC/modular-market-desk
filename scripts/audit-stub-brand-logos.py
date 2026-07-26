#!/usr/bin/env python3
"""Flag likely text-stub / wrong brand logos still on disk (tiny gray placeholders)."""

from __future__ import annotations

from pathlib import Path

OUT = Path("/opt/bitnami/wordpress/wp-content/themes/modulargunworks/assets/images/brands")


def main() -> None:
    from PIL import Image

    suspects = []
    for path in sorted(OUT.glob("*")):
        if path.suffix.lower() not in {".png", ".jpg", ".jpeg", ".webp"}:
            continue
        size = path.stat().st_size
        try:
            im = Image.open(path).convert("RGB")
        except Exception as exc:  # noqa: BLE001
            print(f"UNREADABLE\t{path.name}\t{exc}")
            continue
        w, h = im.size
        # Sample center strip for near-uniform gray + low entropy
        colors = im.getcolors(maxcolors=50000)
        ncolors = len(colors) if colors else 99999
        # Heuristic: tiny file OR very few colors and small dimensions
        reason = []
        if size < 6000 and ncolors < 40:
            reason.append(f"tiny+flat({size}b,{ncolors}c)")
        if w <= 64 and h <= 64 and size < 8000:
            reason.append(f"favicon-size({w}x{h})")
        if reason:
            suspects.append((path.name, size, w, h, ncolors, ",".join(reason)))

    print(f"suspects={len(suspects)}")
    for name, size, w, h, ncolors, reason in suspects:
        print(f"{size}\t{w}x{h}\t{ncolors}c\t{name}\t{reason}")


if __name__ == "__main__":
    main()
