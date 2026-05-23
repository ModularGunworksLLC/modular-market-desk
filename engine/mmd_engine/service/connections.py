"""Site connection status and session refresh for desk / API."""

from __future__ import annotations

import time
from dataclasses import asdict, dataclass
from typing import Any, Literal

from mmd_engine.config import session_path
from mmd_engine.credentials import SiteCredential, get_site, list_sites
from mmd_engine.service.session_auth import (
    MARKET_SITE_URLS,
    refresh_dealer_session,
    refresh_market_session_auto,
    save_session_payload,
)

ConnectionKind = Literal["market", "wholesale", "public"]
SessionStatus = Literal["missing", "stale", "ok"]

STALE_HOURS = 168  # 7 days

# Sites that power /api/valuate live data
VALUATION_CONNECTIONS: list[tuple[str, ConnectionKind]] = [
    ("gunbroker", "market"),
    ("gundeals", "market"),
    ("truegunvalue", "public"),
    ("lipseys", "wholesale"),
    ("zanders", "wholesale"),
]

PUBLIC_SOURCES: dict[str, dict[str, str]] = {
    "truegunvalue": {
        "label": "TrueGunValue",
        "login_url": "https://truegunvalue.com/",
        "notes": "Public pages — no account. Often blocked from cloud servers; use PC cache.",
    },
}


@dataclass
class ConnectionRow:
    id: str
    label: str
    kind: ConnectionKind
    login_url: str
    notes: str
    credentials_configured: bool
    can_auto_login: bool
    session_exists: bool
    session_age_hours: float | None
    session_size_bytes: int | None
    session_status: SessionStatus
    used_by: list[str]


def _session_meta(site_id: str) -> tuple[bool, float | None, int | None, SessionStatus]:
    path = session_path(site_id)
    if not path.is_file():
        return False, None, None, "missing"
    age_hours = round((time.time() - path.stat().st_mtime) / 3600, 1)
    size = path.stat().st_size
    status: SessionStatus = "ok" if age_hours <= STALE_HOURS and size > 500 else "stale"
    if size < 100:
        status = "missing"
    return True, age_hours, size, status


def _label_and_url(site_id: str, kind: ConnectionKind) -> tuple[str, str, str]:
    if site_id in PUBLIC_SOURCES:
        pub = PUBLIC_SOURCES[site_id]
        return pub["label"], pub["login_url"], pub["notes"]
    if site_id in MARKET_SITE_URLS:
        meta = MARKET_SITE_URLS[site_id]
        try:
            site = get_site(site_id)
            notes = site.notes or "Market comps — login improves access."
        except KeyError:
            site = None
            notes = "Market comps — login improves access."
        return meta["label"], (site.login_url if site else meta["url"]), notes
    site = get_site(site_id)
    return site.label, site.login_url, site.notes


def _used_by(site_id: str, kind: ConnectionKind) -> list[str]:
    if kind == "public":
        return ["valuate"]
    if kind == "market":
        return ["valuate"]
    if site_id in {"lipseys", "zanders"}:
        return ["valuate", "wholesale"]
    return ["dealer_search"]


def build_connection_row(site_id: str, kind: ConnectionKind) -> ConnectionRow:
    label, login_url, notes = _label_and_url(site_id, kind)
    creds = False
    can_auto = False
    if kind != "public":
        try:
            site = get_site(site_id)
            creds = site.is_configured()
            can_auto = creds and bool(site.login_url)
        except KeyError:
            pass

    exists, age, size, status = _session_meta(site_id)
    return ConnectionRow(
        id=site_id,
        label=label,
        kind=kind,
        login_url=login_url,
        notes=notes,
        credentials_configured=creds,
        can_auto_login=can_auto,
        session_exists=exists,
        session_age_hours=age,
        session_size_bytes=size,
        session_status=status,
        used_by=_used_by(site_id, kind),
    )


def list_valuation_connections() -> list[dict[str, Any]]:
    return [asdict(build_connection_row(sid, kind)) for sid, kind in VALUATION_CONNECTIONS]


def list_dealer_connections() -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    seen = {sid for sid, _ in VALUATION_CONNECTIONS}
    for site in list_sites(firearms_only=True):
        if site.id in seen or site.excluded or not site.login_url:
            continue
        rows.append(asdict(build_connection_row(site.id, "wholesale")))
    return rows


def refresh_connection(site_id: str, *, mode: str = "auto") -> dict[str, Any]:
    kind = next((k for sid, k in VALUATION_CONNECTIONS if sid == site_id), None)
    if site_id in PUBLIC_SOURCES:
        raise ValueError("TrueGunValue has no login — scrape on your PC and upload valuation cache")

    if mode != "auto":
        raise ValueError("Only auto mode is supported from the API; use connect-site.ps1 on your PC for browser login")

    try:
        if site_id in MARKET_SITE_URLS:
            path = refresh_market_session_auto(site_id, wait_seconds=8)
        else:
            path = refresh_dealer_session(site_id, headless=True, wait_seconds=8)
        resolved_kind = kind or (
            "market" if site_id in MARKET_SITE_URLS else "wholesale"
        )
        row = build_connection_row(site_id, resolved_kind)
        return {
            "ok": True,
            "site_id": site_id,
            "session_path": str(path),
            "message": f"Session saved for {row.label}",
            "connection": asdict(row),
        }
    except Exception as exc:
        return {
            "ok": False,
            "site_id": site_id,
            "message": str(exc),
        }


def upload_connection_session(site_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    allowed = {sid for sid, _ in VALUATION_CONNECTIONS}
    allowed.update(s.id for s in list_sites())
    if site_id not in allowed:
        raise ValueError(f"Unknown site: {site_id}")

    path = save_session_payload(site_id, payload)
    kind = next((k for sid, k in VALUATION_CONNECTIONS if sid == site_id), "wholesale")
    row = build_connection_row(site_id, kind)
    return {
        "ok": True,
        "site_id": site_id,
        "session_path": str(path),
        "message": f"Uploaded session for {row.label}",
        "connection": asdict(row),
    }
