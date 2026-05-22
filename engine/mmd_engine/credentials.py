"""Load dealer/site login credentials from .env and sites.local.yaml (never commit secrets)."""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import yaml

from mmd_engine.config import ENGINE_ROOT, env

logger = logging.getLogger(__name__)

SITES_FILE = ENGINE_ROOT / "sites.local.yaml"
EXAMPLE_FILE = ENGINE_ROOT / "sites.local.yaml.example"


@dataclass
class SiteCredential:
    id: str
    label: str
    enabled: bool = False
    username: str = ""
    password: str = ""
    login_url: str = ""
    requires_session: bool = True
    notes: str = ""
    username_env: str = ""
    password_env: str = ""

    def has_password_login(self) -> bool:
        return bool(self.username and self.password)

    def has_env_login(self) -> bool:
        if self.username_env and self.password_env:
            return bool(env(self.username_env) and env(self.password_env))
        return False

    def resolved_username(self) -> str:
        if self.username:
            return self.username
        if self.username_env:
            return env(self.username_env)
        return ""

    def resolved_password(self) -> str:
        if self.password:
            return self.password
        if self.password_env:
            return env(self.password_env)
        return ""

    def is_configured(self) -> bool:
        return self.enabled and (self.has_password_login() or self.has_env_login())


# Built-in site definitions (login URLs + env var names)
SITE_REGISTRY: dict[str, dict[str, Any]] = {
    "lipseys": {
        "label": "Lipsey's",
        "login_url": "https://www.lipseys.com/login",
        "username_env": "LIPSEYS_USER",
        "password_env": "LIPSEYS_PASS",
        "requires_session": True,
        "notes": "Wholesale — import CSV or live search after login.",
    },
    "zanders": {
        "label": "Zanders Sporting Goods",
        "login_url": "https://www.zanders.com/login.asp",
        "username_env": "ZANDERS_USER",
        "password_env": "ZANDERS_PASS",
        "requires_session": True,
    },
    "davidsons": {
        "label": "Davidson's",
        "login_url": "https://www.davidsonsinc.com/dealer-login",
        "username_env": "DAVIDSONS_USER",
        "password_env": "DAVIDSONS_PASS",
        "requires_session": True,
        "notes": "Adapter coming soon — credentials stored for future use.",
    },
    "sports_south": {
        "label": "Sports South",
        "login_url": "https://www.sportssouth.com/login",
        "username_env": "SPORTS_SOUTH_USER",
        "password_env": "SPORTS_SOUTH_PASS",
        "requires_session": True,
        "notes": "Adapter coming soon.",
    },
    "rsr": {
        "label": "RSR Group",
        "login_url": "https://www.rsrgroup.com/login",
        "username_env": "RSR_USER",
        "password_env": "RSR_PASS",
        "requires_session": True,
        "notes": "Adapter coming soon.",
    },
    "gunbroker": {
        "label": "GunBroker",
        "login_url": "https://www.gunbroker.com/user/login",
        "username_env": "GUNBROKER_USER",
        "password_env": "GUNBROKER_PASS",
        "requires_session": False,
        "notes": "Public search works without login; account optional.",
    },
}


def _load_yaml_overrides() -> dict[str, dict[str, Any]]:
    if not SITES_FILE.exists():
        return {}
    try:
        data = yaml.safe_load(SITES_FILE.read_text(encoding="utf-8")) or {}
        return data.get("sites", {}) or {}
    except yaml.YAMLError as exc:
        logger.warning("Invalid %s: %s", SITES_FILE, exc)
        return {}


def get_site(site_id: str) -> SiteCredential:
    base = SITE_REGISTRY.get(site_id, {})
    overrides = _load_yaml_overrides().get(site_id, {})

    return SiteCredential(
        id=site_id,
        label=overrides.get("label") or base.get("label", site_id),
        enabled=bool(overrides.get("enabled", base.get("enabled", False))),
        username=str(overrides.get("username") or "").strip(),
        password=str(overrides.get("password") or "").strip(),
        login_url=overrides.get("login_url") or base.get("login_url", ""),
        requires_session=bool(overrides.get("requires_session", base.get("requires_session", True))),
        notes=overrides.get("notes") or base.get("notes", ""),
        username_env=overrides.get("username_env") or base.get("username_env", ""),
        password_env=overrides.get("password_env") or base.get("password_env", ""),
    )


def list_sites() -> list[SiteCredential]:
    ids = sorted(set(SITE_REGISTRY) | set(_load_yaml_overrides()))
    return [get_site(sid) for sid in ids]


def sites_with_adapters() -> list[str]:
    """Sites that have a working dealer adapter today."""
    return ["lipseys", "zanders"]
