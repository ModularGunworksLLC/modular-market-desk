#!/usr/bin/env python3
"""Set enabled: true for every site with username+password (except kroll/hicks)."""
from __future__ import annotations

import sys
from pathlib import Path

import yaml

APP = Path(__file__).resolve().parents[1]
SITES_FILE = APP / "engine" / "sites.local.yaml"
EXCLUDED = frozenset({"kroll", "hicks"})


def main() -> None:
    if not SITES_FILE.exists():
        print(f"Missing {SITES_FILE}", file=sys.stderr)
        sys.exit(1)

    data = yaml.safe_load(SITES_FILE.read_text(encoding="utf-8")) or {}
    sites: dict = data.get("sites") or {}
    enabled: list[str] = []
    skipped: list[str] = []

    for sid, cfg in sites.items():
        if sid in EXCLUDED:
            cfg["enabled"] = False
            continue
        user = str(cfg.get("username") or "").strip()
        pwd = str(cfg.get("password") or "").strip()
        if user and pwd:
            cfg["enabled"] = True
            enabled.append(sid)
        else:
            cfg["enabled"] = False
            if user and not pwd:
                skipped.append(f"{sid}(no password)")
            elif not user:
                skipped.append(f"{sid}(empty)")

    SITES_FILE.write_text(
        yaml.dump({"sites": sites}, default_flow_style=False, sort_keys=False, allow_unicode=True),
        encoding="utf-8",
    )
    print("Enabled:", ", ".join(enabled) if enabled else "none")
    if skipped:
        print("Left off:", ", ".join(skipped))


if __name__ == "__main__":
    main()
