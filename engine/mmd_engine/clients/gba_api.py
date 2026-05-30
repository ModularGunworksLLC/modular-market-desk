"""HTTP client for GunBroker Analytics portal API (Outdoor Analytics hub)."""

from __future__ import annotations

import logging
from typing import Any

import httpx

from mmd_engine.config import oa_api_base

logger = logging.getLogger(__name__)

DEFAULT_TIMEOUT = 180.0


class GbaApiError(Exception):
    pass


class GbaApiClient:
    """Bearer-authenticated client for /pricing/* and /auth/me."""

    def __init__(self, bearer_token: str, *, base_url: str | None = None) -> None:
        self._token = bearer_token.strip()
        self._base = (base_url or oa_api_base()).rstrip("/")
        if not self._token:
            raise GbaApiError("Missing bearer token")

    def _headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self._token}",
            "Accept": "application/json",
            "X-Skip-Cache": "true",
        }

    def get(self, path: str, *, params: dict[str, Any] | None = None) -> Any:
        url = f"{self._base}{path}"
        try:
            with httpx.Client(timeout=DEFAULT_TIMEOUT, follow_redirects=True) as client:
                resp = client.get(url, headers=self._headers(), params=params)
        except httpx.HTTPError as exc:
            raise GbaApiError(f"Request failed: {exc}") from exc

        if resp.status_code == 401:
            raise GbaApiError("Unauthorized — refresh Outdoor Analytics session token")
        if resp.status_code >= 400:
            raise GbaApiError(f"HTTP {resp.status_code}: {resp.text[:200]}")

        try:
            body = resp.json()
        except ValueError as exc:
            raise GbaApiError("Invalid JSON response") from exc

        if isinstance(body, dict) and body.get("error"):
            raise GbaApiError(str(body.get("message") or "API error"))
        if isinstance(body, dict) and "data" in body:
            return body["data"]
        return body

    def auth_me(self) -> dict[str, Any] | None:
        data = self.get("/auth/me")
        return data if isinstance(data, dict) else None

    def pricing_dependencies(self) -> dict[str, Any]:
        data = self.get("/pricing/dependencies")
        return data if isinstance(data, dict) else {}

    def pricing_data(
        self,
        *,
        model_id: int,
        caliber_id: int,
        condition: str,
    ) -> list[dict[str, Any]]:
        data = self.get(
            "/pricing/data",
            params={
                "modelID": model_id,
                "caliberID": caliber_id,
                "condition": condition,
            },
        )
        return data if isinstance(data, list) else []

    def active_listings(
        self,
        *,
        model_id: int,
        caliber_id: int,
        use_parent_model: bool = True,
    ) -> list[dict[str, Any]]:
        data = self.get(
            "/pricing/active-listings",
            params={
                "modelID": model_id,
                "caliberID": caliber_id,
                "useParentModel": "1" if use_parent_model else "0",
            },
        )
        return data if isinstance(data, list) else []
