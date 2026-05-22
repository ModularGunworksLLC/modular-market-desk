"""Import wholesaler inventory CSV into valuation wholesale store."""

from __future__ import annotations

import argparse
import sys

from mmd_engine.csv import import_csv_file, load_preset
from mmd_engine.csv.mapping import list_presets
from mmd_engine.csv.store import merge_inventory, save_inventory


def main() -> None:
    parser = argparse.ArgumentParser(description="Import distributor CSV for Modular Market Desk")
    parser.add_argument("--source", "-s", required=True, help="Inventory source id (e.g. lipseys, zanders)")
    parser.add_argument("--file", "-f", required=True, type=str, help="Path to CSV file")
    parser.add_argument(
        "--preset",
        "-p",
        default="",
        help=f"Column preset ({', '.join(list_presets())} or same as --source)",
    )
    parser.add_argument(
        "--replace",
        action="store_true",
        help="Replace existing inventory instead of merging",
    )
    args = parser.parse_args()

    preset_name = args.preset or args.source
    try:
        preset = load_preset(preset_name)
    except FileNotFoundError as exc:
        print(exc, file=sys.stderr)
        sys.exit(1)

    from pathlib import Path

    path = Path(args.file)
    if not path.exists():
        print(f"File not found: {path}", file=sys.stderr)
        sys.exit(1)

    preset.source = args.source
    new_items = import_csv_file(path, preset)
    merged = merge_inventory(args.source, new_items, replace=args.replace)
    out = save_inventory(args.source, merged, imported_from=str(path))
    print(f"Imported {len(new_items)} rows -> {len(merged)} total -> {out}")


if __name__ == "__main__":
    main()
