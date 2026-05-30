"""Upload and import wholesaler CSV catalogs for valuation."""

from __future__ import annotations

import json
import re
from pathlib import Path

from mmd_engine.config import env
from mmd_engine.csv import import_csv_file, load_preset
from mmd_engine.csv.importer import decode_csv_bytes
from mmd_engine.csv.mapping import list_presets
from mmd_engine.csv.store import INVENTORY_DIR, inventory_path, list_inventory_sources, merge_inventory, save_inventory

IMPORTS_DIR = Path(__file__).resolve().parents[2] / "data" / "imports"


def _max_csv_bytes() -> int:
    raw = env("MMD_MAX_CSV_MB", "200")
    try:
        mb = max(1, int(raw))
    except ValueError:
        mb = 200
    return mb * 1024 * 1024


def _safe_source_id(source: str) -> str:
    cleaned = re.sub(r"[^a-zA-Z0-9_-]+", "", (source or "").strip().lower())
    if not cleaned:
        raise ValueError("source must be letters, numbers, underscore, or hyphen (e.g. lipseys)")
    return cleaned


def _safe_filename(name: str) -> str:
    base = Path(name).name
    base = re.sub(r"[^\w.\-]+", "_", base)
    return base or "upload.csv"


def list_inventory_catalogs() -> list[dict]:
    catalogs: list[dict] = []
    for source in list_inventory_sources():
        path = inventory_path(source)
        if not path.is_file():
            continue
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            data = {}
        catalogs.append(
            {
                "source": source,
                "count": data.get("count", 0),
                "generated_at": data.get("generated_at", ""),
                "imported_from": data.get("imported_from", ""),
            }
        )
    return sorted(catalogs, key=lambda c: c["source"])


def import_uploaded_csv(
    content: bytes,
    filename: str,
    *,
    source: str,
    preset: str = "",
    replace: bool = False,
) -> dict:
    max_bytes = _max_csv_bytes()
    if len(content) > max_bytes:
        raise ValueError(f"CSV too large (max {max_bytes // (1024 * 1024)} MB)")
    if not content.strip():
        raise ValueError("Empty file")

    source_id = _safe_source_id(source)
    preset_name = _safe_source_id(preset) if preset else source_id
    try:
        csv_preset = load_preset(preset_name)
    except FileNotFoundError as exc:
        raise ValueError(str(exc)) from exc

    csv_preset.source = source_id
    IMPORTS_DIR.mkdir(parents=True, exist_ok=True)
    INVENTORY_DIR.mkdir(parents=True, exist_ok=True)

    dest = IMPORTS_DIR / _safe_filename(filename)
    dest.write_text(decode_csv_bytes(content), encoding="utf-8", newline="")

    new_items = import_csv_file(dest, csv_preset)
    if not new_items:
        raise ValueError(
            "No rows imported — check column headers match the preset "
            f"({preset_name}). Required: dealer price (or MSRP) plus manufacturer/model or description."
        )

    merged = merge_inventory(source_id, new_items, replace=replace)
    out_path = save_inventory(source_id, merged, imported_from=str(dest))

    return {
        "ok": True,
        "source": source_id,
        "preset": preset_name,
        "rows_imported": len(new_items),
        "total_rows": len(merged),
        "replace": replace,
        "saved_to": str(out_path),
        "uploaded_as": dest.name,
    }


def list_csv_presets() -> list[str]:
    return list_presets()
