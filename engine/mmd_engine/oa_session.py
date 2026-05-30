"""Outdoor Analytics (GunBroker Analytics portal) bearer token storage."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from mmd_engine.config import env, oa_session_path
from mmd_engine.models import utc_now_iso

OA_SITE_ID = "outdoor_analytics"


def load_bearer_token() -> str | None:
    """Token from MMD_OA_BEARER_TOKEN or data/sessions/outdoor_analytics.json."""
    direct = env("MMD_OA_BEARER_TOKEN")
    if direct:
        return direct

    path = oa_session_path()
    if not path.is_file():
        return None
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return None
    token = (payload.get("bearer_token") or payload.get("gb_session_token") or "").strip()
    return token or None


def save_bearer_token(token: str, *, source: str = "capture") -> Path:
    token = token.strip()
    if len(token) < 40:
        raise ValueError(
            f"Bearer token looks too short ({len(token)} chars). "
            "Copy the full gb_session_token from Chrome sessionStorage."
        )
    if "\\" in token or "scripts" in token.lower() or token.lower().startswith("cd "):
        raise ValueError(
            "That looks like a shell command, not a token. "
            "In Chrome run: copy(sessionStorage.getItem('gb_session_token'))"
        )
    path = oa_session_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "bearer_token": token,
        "gb_session_token": token,
        "updated_at": utc_now_iso(),
        "source": source,
    }
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    return path


def save_token_payload(payload: dict[str, Any]) -> Path:
    token = (
        payload.get("bearer_token")
        or payload.get("gb_session_token")
        or payload.get("token")
        or ""
    )
    if isinstance(token, str) and token.strip():
        return save_bearer_token(token.strip(), source="upload")
    raise ValueError("Expected bearer_token or gb_session_token in JSON")
