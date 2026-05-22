"""Persist imported wholesaler inventory on disk."""

from __future__ import annotations

import json
from pathlib import Path

from mmd_engine.config import ENGINE_ROOT
from mmd_engine.models import CatalogItem, utc_now_iso

INVENTORY_DIR = ENGINE_ROOT / "data" / "inventory"
IMPORTS_DIR = ENGINE_ROOT / "data" / "imports"


def inventory_path(source: str) -> Path:
    INVENTORY_DIR.mkdir(parents=True, exist_ok=True)
    return INVENTORY_DIR / f"{source}.json"


def load_inventory(source: str) -> list[CatalogItem]:
    path = inventory_path(source)
    if not path.exists():
        return []
    data = json.loads(path.read_text(encoding="utf-8"))
    items: list[CatalogItem] = []
    for row in data.get("catalog", []):
        items.append(CatalogItem(**row))
    return items


def save_inventory(source: str, items: list[CatalogItem], *, imported_from: str = "") -> Path:
    path = inventory_path(source)
    payload = {
        "source": source,
        "generated_at": utc_now_iso(),
        "imported_from": imported_from,
        "count": len(items),
        "catalog": [item.to_dict() for item in items],
    }
    path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    return path


def list_inventory_sources() -> list[str]:
    if not INVENTORY_DIR.exists():
        return []
    return sorted(p.stem for p in INVENTORY_DIR.glob("*.json"))


def merge_inventory(
    source: str,
    new_items: list[CatalogItem],
    *,
    replace: bool = False,
) -> list[CatalogItem]:
    existing = [] if replace else load_inventory(source)
    by_key: dict[str, CatalogItem] = {}

    def key(item: CatalogItem) -> str:
        return (item.upc or item.id).lower()

    for item in existing:
        by_key[key(item)] = item
    for item in new_items:
        by_key[key(item)] = item

    merged = list(by_key.values())
    return merged
