"""Parse wholesaler inventory CSV files into catalog items."""

from __future__ import annotations

import csv
import re
from pathlib import Path

from mmd_engine.csv.mapping import CsvPreset, normalize_header, resolve_column
from mmd_engine.models import CatalogItem, utc_now_iso
from mmd_engine.util import matches_query, parse_price, slug_id

PRICE_FIELDS = ("dealer_price", "msrp")


def import_csv_file(
    path: Path,
    preset: CsvPreset,
    *,
    query: str = "",
) -> list[CatalogItem]:
    text = path.read_text(encoding="utf-8-sig")
    delimiter = _detect_delimiter(text)
    reader = csv.DictReader(text.splitlines(), delimiter=delimiter)
    if not reader.fieldnames:
        raise ValueError(f"No headers found in {path}")

    headers = list(reader.fieldnames)
    col_map = _build_column_map(headers, preset)
    if "dealer_price" not in col_map and "msrp" in col_map:
        col_map["dealer_price"] = col_map["msrp"]

    now = utc_now_iso()
    rows: list[CatalogItem] = []

    for i, raw in enumerate(reader):
        item = _row_to_catalog(raw, col_map, preset, now, row_index=i)
        if item is None:
            continue
        hay = f"{item.manufacturer} {item.model} {item.upc or ''} {item.caliber} {item.source}"
        if query and not matches_query(hay, query):
            continue
        rows.append(item)

    return rows


def _detect_delimiter(text: str) -> str:
    try:
        dialect = csv.Sniffer().sniff(text[:4096], delimiters=",;\t|")
        return dialect.delimiter
    except csv.Error:
        return ","


def _build_column_map(headers: list[str], preset: CsvPreset) -> dict[str, str]:
    col_map: dict[str, str] = {}
    for field_name in (
        "sku",
        "upc",
        "manufacturer",
        "model",
        "description",
        "caliber",
        "category",
        "action",
        "dealer_price",
        "msrp",
        "qty",
        "on_sale",
    ):
        aliases = preset.aliases_for(field_name)
        if not aliases:
            continue
        resolved = resolve_column(headers, aliases)
        if resolved:
            col_map[field_name] = resolved
    return col_map


def _row_to_catalog(
    raw: dict[str, str | None],
    col_map: dict[str, str],
    preset: CsvPreset,
    scraped_at: str,
    *,
    row_index: int,
) -> CatalogItem | None:
    def cell(field: str) -> str:
        key = col_map.get(field)
        if not key:
            return ""
        return (raw.get(key) or "").strip()

    description = cell("description")
    manufacturer = cell("manufacturer") or _guess_manufacturer(description)
    model = cell("model") or _guess_model(description, manufacturer)
    if not manufacturer and not model and not description:
        return None

    if not model and description:
        model = description
    if not manufacturer:
        manufacturer = "Unknown"

    dealer_price = _parse_money(cell("dealer_price"))
    msrp = _parse_money(cell("msrp"))
    if dealer_price is None and msrp is not None:
        dealer_price = msrp
    if dealer_price is None:
        return None

    sku = cell("sku")
    upc = cell("upc") or None
    item_id = slug_id(preset.source, sku or upc or manufacturer, model, str(dealer_price), str(row_index))

    category_raw = cell("category").lower()
    category = _normalize_category(category_raw, preset)
    action_raw = cell("action").lower()
    action = _normalize_action(action_raw, preset)

    qty = _parse_qty(cell("qty"))
    in_stock = qty > 0 if qty is not None else _parse_bool_stock(cell("qty"))
    on_sale = _parse_on_sale(cell("on_sale"), dealer_price, msrp)

    return CatalogItem(
        id=item_id,
        source=preset.source,
        manufacturer=manufacturer,
        model=model,
        upc=upc,
        category=category,
        action=action,
        caliber=cell("caliber"),
        dealer_price=dealer_price,
        in_stock=in_stock,
        on_sale=on_sale,
        scraped_at=scraped_at,
    )


def _parse_money(value: str) -> float | None:
    if not value:
        return None
    cleaned = re.sub(r"[^\d.]", "", value.replace(",", ""))
    if not cleaned:
        return None
    try:
        return float(cleaned)
    except ValueError:
        return parse_price(value)


def _parse_qty(value: str) -> int | None:
    if not value:
        return None
    cleaned = re.sub(r"[^\d]", "", value)
    if not cleaned:
        return None
    return int(cleaned)


def _parse_bool_stock(value: str) -> bool:
    v = value.strip().lower()
    if not v:
        return True
    if v in {"0", "no", "n", "out", "out of stock", "false", "unavailable"}:
        return False
    if v in {"yes", "y", "true", "in stock", "available", "instock"}:
        return True
    qty = _parse_qty(value)
    return (qty or 0) > 0


def _parse_on_sale(value: str, price: float, msrp: float | None) -> bool:
    v = value.strip().lower()
    if v in {"yes", "y", "true", "sale", "on sale", "1"}:
        return True
    if msrp and msrp > price:
        return True
    return False


def _normalize_category(raw: str, preset: CsvPreset) -> str:
    if any(k in raw for k in preset.category_handgun):
        return "handgun"
    if any(k in raw for k in preset.category_rifle):
        return "rifle"
    if "shotgun" in raw:
        return "shotgun"
    return "handgun" if raw else "handgun"


def _normalize_action(raw: str, preset: CsvPreset) -> str:
    if any(v in raw for v in preset.semi_auto_values):
        return "semi-auto"
    if "bolt" in raw:
        return "bolt"
    if "pump" in raw:
        return "pump"
    if "revolver" in raw:
        return "revolver"
    return "semi-auto" if not raw else raw


def _guess_manufacturer(description: str) -> str:
    if not description:
        return ""
    return description.split()[0]


def _guess_model(description: str, manufacturer: str) -> str:
    if not description:
        return ""
    parts = description.split()
    if parts and parts[0].lower() == manufacturer.lower():
        return " ".join(parts[1:])
    return description
