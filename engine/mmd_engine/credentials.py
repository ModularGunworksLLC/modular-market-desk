"""Load dealer/site login credentials from .env and sites.local.yaml (never commit secrets)."""

from __future__ import annotations

import logging
from dataclasses import dataclass
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
    excluded: bool = False
    includes_firearms: bool = True
    age_gate_yes: str = ""

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
        if self.excluded:
            return False
        return self.enabled and (self.has_password_login() or self.has_env_login())


# Registry: your wholesale bookmarks (login URLs + env var names)
SITE_REGISTRY: dict[str, dict[str, Any]] = {
    # --- Firearms wholesalers (valuation desk targets) ---
    "lipseys": {
        "label": "Lipsey's",
        "login_url": "https://www.lipseys.com/login",
        "username_env": "LIPSEYS_USER",
        "password_env": "LIPSEYS_PASS",
        "includes_firearms": True,
        "notes": "Live adapter + CSV import.",
    },
    "zanders": {
        "label": "Zanders Sporting Goods",
        "login_url": "https://shop2.gzanders.com/customer/account/login/referer/aHR0cHM6Ly9zaG9wMi5nemFuZGVycy5jb20vY3VzdG9tZXIvYWNjb3VudC9pbmRleC8~/",
        "username_env": "ZANDERS_USER",
        "password_env": "ZANDERS_PASS",
        "includes_firearms": True,
        "notes": "Live adapter + CSV import. Cloudflare — run cli.auth zanders once.",
    },
    "davidsons": {
        "label": "Davidson's",
        "login_url": "https://www.davidsonsinc.com/customer/account/login/referer/aHR0cHM6Ly93d3cuZGF2aWRzb25zaW5jLmNvbS9jdXN0b21lci9hY2NvdW50L2xvZ291dFN1Y2Nlc3Mv/",
        "username_env": "DAVIDSONS_USER",
        "password_env": "DAVIDSONS_PASS",
        "includes_firearms": True,
        "notes": "Adapter planned.",
    },
    "sports_south": {
        "label": "Sports South",
        "login_url": "https://www.sportssouth.com/login",
        "username_env": "SPORTS_SOUTH_USER",
        "password_env": "SPORTS_SOUTH_PASS",
        "includes_firearms": True,
        "notes": "Adapter planned.",
    },
    "second_amendment": {
        "label": "2nd Amendment Wholesale",
        "login_url": "https://www.2ndamendmentwholesale.com/login",
        "username_env": "SECOND_AMENDMENT_USER",
        "password_env": "SECOND_AMENDMENT_PASS",
        "includes_firearms": True,
        "notes": "Adapter planned.",
    },
    "orion": {
        "label": "Orion Wholesale",
        "login_url": "https://www.orionwholesale.com/login",
        "username_env": "ORION_USER",
        "password_env": "ORION_PASS",
        "includes_firearms": True,
        "notes": "Adapter planned.",
    },
    "chattanooga": {
        "label": "Chattanooga Shooting (dealers)",
        "login_url": "https://chattanoogashooting.com/login",
        "username_env": "CHATTANOOGA_USER",
        "password_env": "CHATTANOOGA_PASS",
        "includes_firearms": True,
        "notes": "Adapter planned.",
    },
    "primary_arms": {
        "label": "Primary Arms Wholesale",
        "login_url": "https://www.primaryarms.com/dealer/login",
        "username_env": "PRIMARY_ARMS_USER",
        "password_env": "PRIMARY_ARMS_PASS",
        "includes_firearms": True,
        "notes": "Adapter planned — confirm wholesale portal URL in browser.",
    },
    "zro_delta": {
        "label": "ZRO Delta",
        "login_url": "https://www.zrodelta.com/login",
        "username_env": "ZRO_DELTA_USER",
        "password_env": "ZRO_DELTA_PASS",
        "includes_firearms": True,
        "notes": "Adapter planned.",
    },
    "lakeline": {
        "label": "Lakeline LLC",
        "login_url": "https://www.lakelinellc.com/login",
        "username_env": "LAKELINE_USER",
        "password_env": "LAKELINE_PASS",
        "includes_firearms": True,
        "notes": "Adapter planned.",
    },
    # --- Gear / parts (not primary firearm valuation sources) ---
    "rsr": {
        "label": "RSR Group",
        "login_url": "https://www.rsrgroup.com/login",
        "username_env": "RSR_USER",
        "password_env": "RSR_PASS",
        "includes_firearms": False,
        "notes": "Gear & accessories only — no firearms (your note).",
    },
    "righttobear": {
        "label": "RightToBear",
        "login_url": "https://www.righttobear.com/login",
        "username_env": "RIGHTTOBEAR_USER",
        "password_env": "RIGHTTOBEAR_PASS",
        "includes_firearms": False,
        "notes": "AR parts — not complete firearms.",
    },
    "shootersgate": {
        "label": "ShootersGate",
        "login_url": "https://www.shootersgate.com/login",
        "username_env": "SHOOTERSGATE_USER",
        "password_env": "SHOOTERSGATE_PASS",
        "includes_firearms": False,
        "notes": "Parts — not complete firearms.",
    },
    "bear_creek": {
        "label": "Bear Creek Arsenal",
        "login_url": "https://bearcreekarsenal.com/login",
        "username_env": "BEAR_CREEK_USER",
        "password_env": "BEAR_CREEK_PASS",
        "includes_firearms": False,
        "notes": "Parts/uppers — not typical completed-gun comps.",
    },
    # --- Tools / other (credentials optional) ---
    "fflsafe": {
        "label": "FFL Safe",
        "login_url": "https://www.fflsafe.com/login",
        "username_env": "FFLSAFE_USER",
        "password_env": "FFLSAFE_PASS",
        "includes_firearms": False,
        "requires_session": True,
        "notes": "Compliance tool — not pricing.",
    },
    "fflezcheck": {
        "label": "FFLeZ Check",
        "login_url": "https://www.fflezcheck.com/",
        "includes_firearms": False,
        "requires_session": False,
        "notes": "FFL lookup tool — not product pricing.",
    },
    "guidefitter": {
        "label": "Guidefitter Pro Deals",
        "login_url": "https://www.guidefitter.com/login",
        "username_env": "GUIDEFITTER_USER",
        "password_env": "GUIDEFITTER_PASS",
        "includes_firearms": False,
        "notes": "Outdoor pro deals — mixed categories.",
    },
    "amped_airsoft": {
        "label": "Amped Airsoft",
        "login_url": "https://www.ampedairsoft.com/login",
        "username_env": "AMPED_AIRSOFT_USER",
        "password_env": "AMPED_AIRSOFT_PASS",
        "includes_firearms": False,
        "notes": "Airsoft — outside firearm valuation scope.",
    },
    # --- Excluded (do not use) ---
    "kroll": {
        "label": "KROLL",
        "excluded": True,
        "enabled": False,
        "notes": "Excluded — not used for Modular Market Desk.",
    },
    "hicks": {
        "label": "Hicks Inc.",
        "excluded": True,
        "enabled": False,
        "notes": "Excluded — not used for Modular Market Desk.",
    },
    # --- Public market (optional account) ---
    "gunbroker": {
        "label": "GunBroker",
        "login_url": "https://www.gunbroker.com/user/login",
        "username_env": "GUNBROKER_USER",
        "password_env": "GUNBROKER_PASS",
        "requires_session": False,
        "includes_firearms": True,
        "notes": "Public comps — login optional.",
    },
    "gundeals": {
        "label": "Gun.deals",
        "login_url": "https://www.gun.deals/",
        "username_env": "GUNDEALS_USER",
        "password_env": "GUNDEALS_PASS",
        "requires_session": False,
        "includes_firearms": True,
        "notes": "Retail promos — login optional.",
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

    excluded = bool(overrides.get("excluded", base.get("excluded", False)))
    enabled = False if excluded else bool(overrides.get("enabled", base.get("enabled", False)))

    return SiteCredential(
        id=site_id,
        label=overrides.get("label") or base.get("label", site_id),
        enabled=enabled,
        username=str(overrides.get("username") or "").strip(),
        password=str(overrides.get("password") or "").strip(),
        login_url=overrides.get("login_url") or base.get("login_url", ""),
        requires_session=bool(overrides.get("requires_session", base.get("requires_session", True))),
        notes=overrides.get("notes") or base.get("notes", ""),
        username_env=overrides.get("username_env") or base.get("username_env", ""),
        password_env=overrides.get("password_env") or base.get("password_env", ""),
        excluded=excluded,
        includes_firearms=bool(
            overrides.get("includes_firearms", base.get("includes_firearms", True))
        ),
        age_gate_yes=str(overrides.get("age_gate_yes") or base.get("age_gate_yes") or "").strip(),
    )


def list_sites(*, firearms_only: bool = False, include_excluded: bool = False) -> list[SiteCredential]:
    ids = sorted(set(SITE_REGISTRY) | set(_load_yaml_overrides()))
    sites = [get_site(sid) for sid in ids]
    if not include_excluded:
        sites = [s for s in sites if not s.excluded]
    if firearms_only:
        sites = [s for s in sites if s.includes_firearms]
    return sites


def sites_with_adapters() -> list[str]:
    return ["lipseys", "zanders"]
