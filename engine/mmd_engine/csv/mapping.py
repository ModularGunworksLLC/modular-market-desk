"""Column mapping presets for wholesaler CSV exports."""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path

PRESETS_DIR = Path(__file__).resolve().parents[2] / "config" / "csv_presets"


@dataclass
class CsvPreset:
    source: str
    columns: dict[str, list[str]] = field(default_factory=dict)
    category_handgun: list[str] = field(default_factory=lambda: ["handgun", "pistol", "revolver"])
    category_rifle: list[str] = field(default_factory=lambda: ["rifle", "ar", "carbine"])
    semi_auto_values: list[str] = field(default_factory=lambda: ["semi-auto", "semi auto", "semiauto", "semi"])

    def aliases_for(self, field_name: str) -> list[str]:
        return [a.strip() for a in self.columns.get(field_name, []) if a.strip()]


def load_preset(name: str) -> CsvPreset:
    path = PRESETS_DIR / f"{name}.json"
    if not path.exists():
        raise FileNotFoundError(f"Unknown CSV preset '{name}'. Available: {list_presets()}")
    data = json.loads(path.read_text(encoding="utf-8-sig"))
    default = CsvPreset(source=name)
    return CsvPreset(
        source=data.get("source", name),
        columns=data.get("columns", {}),
        category_handgun=data.get("category_handgun", default.category_handgun),
        category_rifle=data.get("category_rifle", default.category_rifle),
        semi_auto_values=data.get("semi_auto_values", default.semi_auto_values),
    )


def list_presets() -> list[str]:
    if not PRESETS_DIR.exists():
        return []
    return sorted(p.stem for p in PRESETS_DIR.glob("*.json"))


def normalize_header(header: str) -> str:
    return header.strip().lower().replace("_", " ")


def resolve_column(headers: list[str], aliases: list[str]) -> str | None:
    normalized = {normalize_header(h): h for h in headers}
    for alias in aliases:
        key = normalize_header(alias)
        if key in normalized:
            return normalized[key]
    return None
