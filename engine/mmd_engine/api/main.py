"""FastAPI entrypoint for Modular Market Desk."""

from __future__ import annotations

import time

from typing import Any

from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from mmd_engine.config import SESSIONS_DIR, api_key
from mmd_engine.service.connections import (
    list_dealer_connections,
    list_valuation_connections,
    refresh_connection,
    upload_connection_session,
)
from mmd_engine.filters import SearchFilters
from mmd_engine.service.search import run_search
from mmd_engine.service.inventory_import import (
    import_uploaded_csv,
    list_csv_presets,
    list_inventory_catalogs,
)
from mmd_engine.service.valuation import recompute_valuation, run_valuation
from mmd_engine.valuation_models import ContextMode, FirearmQuery

app = FastAPI(title="Modular Market Desk API", version="0.4.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST", "PUT", "OPTIONS"],
    allow_headers=["*"],
)


class SearchRequest(BaseModel):
    q: str = ""
    semi_auto_only: bool = False
    in_stock_only: bool = False
    on_sale_only: bool = False
    min_margin_pct: float = 0


class DealAssumptions(BaseModel):
    """Dealer cost / fee inputs shared by valuate and recompute."""

    context: ContextMode = "auction_sniper"
    my_cost: float | None = None
    street_retail: float | None = None
    reference_msrp: float | None = None
    buyer_premium_pct: float | None = None
    listing_addons: float | None = None
    target_profit: float | None = None
    min_margin_pct: float | None = None
    transfer_fee: float | None = None
    inbound_ship: float | None = None
    sell_assumption: str | None = None  # p25 | median | p75


class FirearmFields(BaseModel):
    category: str = "handgun"
    manufacturer: str = ""
    model: str = ""
    variant: str = ""
    caliber: str = ""
    condition: str = "any"
    barrel_length: str = ""
    upc: str = ""
    mpn: str = ""
    exclude_tokens: list[str] = Field(default_factory=list)


class ValuateRequest(FirearmFields, DealAssumptions):
    use_cache: bool = False
    force_refresh: bool = True
    sample_only: bool = False


class RecomputeRequest(FirearmFields, DealAssumptions):
    pass


def require_api_key(x_api_key: str | None = Header(default=None)) -> None:
    expected = api_key()
    if not expected:
        return
    if x_api_key != expected:
        raise HTTPException(status_code=401, detail="Invalid API key")


_MARKET_SESSIONS = ("outdoor_analytics",)


def _session_info(name: str) -> dict:
    path = SESSIONS_DIR / f"{name}.json"
    if not path.is_file():
        return {"exists": False, "age_hours": None}
    age_hours = round((time.time() - path.stat().st_mtime) / 3600, 1)
    return {"exists": True, "age_hours": age_hours, "size_bytes": path.stat().st_size}


@app.get("/")
def root() -> dict[str, str]:
    return {
        "service": "modular-market-desk",
        "message": "API is running. Use the web UI (Vite dev server), not this URL in the browser.",
        "health": "/health",
        "valuate": "POST /api/valuate",
        "recompute": "POST /api/recompute",
        "connections": "GET /api/connections",
        "inventory": "GET /api/inventory",
        "inventory_import": "POST /api/inventory/import",
    }


@app.get("/health")
def health() -> dict:
    sessions = {name: _session_info(name) for name in _MARKET_SESSIONS}
    missing = [n for n, info in sessions.items() if not info["exists"]]
    return {
        "status": "ok",
        "service": "modular-market-desk",
        "version": "0.4.0",
        "sessions_dir": str(SESSIONS_DIR),
        "market_sessions": sessions,
        "sessions_ok": len(missing) == 0,
        "sessions_missing": missing,
    }


@app.post("/api/search", dependencies=[Depends(require_api_key)])
def search(body: SearchRequest) -> dict:
    filters = SearchFilters(
        query=body.q,
        semi_auto_only=body.semi_auto_only,
        in_stock_only=body.in_stock_only,
        on_sale_only=body.on_sale_only,
        min_margin_pct=body.min_margin_pct,
    )
    bundle = run_search(body.q, filters=filters)
    return bundle.to_dict()


@app.get("/api/connections", dependencies=[Depends(require_api_key)])
def connections_list() -> dict:
    valuation = list_valuation_connections()
    dealers = list_dealer_connections()
    return {
        "valuation": valuation,
        "dealers": dealers,
        "hint": (
            "Use Auto-login on server when credentials are set, or connect-site.ps1 on your PC "
            "for MFA/CAPTCHA sites."
        ),
    }


class RefreshConnectionRequest(BaseModel):
    mode: str = "auto"


@app.post(
    "/api/connections/{site_id}/refresh",
    dependencies=[Depends(require_api_key)],
)
def connections_refresh(site_id: str, body: RefreshConnectionRequest | None = None) -> dict:
    mode = body.mode if body else "auto"
    result = refresh_connection(site_id, mode=mode)
    if not result.get("ok"):
        raise HTTPException(status_code=400, detail=result.get("message", "refresh failed"))
    return result


@app.put(
    "/api/connections/{site_id}/session",
    dependencies=[Depends(require_api_key)],
)
def connections_upload_session(site_id: str, payload: dict[str, Any]) -> dict:
    try:
        return upload_connection_session(site_id, payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.get("/api/inventory", dependencies=[Depends(require_api_key)])
def inventory_list() -> dict:
    return {
        "catalogs": list_inventory_catalogs(),
        "presets": list_csv_presets(),
        "hint": "Import wholesaler CSV exports; they appear on the Valuation desk Wholesale tab.",
    }


@app.post("/api/inventory/import", dependencies=[Depends(require_api_key)])
async def inventory_import(
    file: UploadFile = File(...),
    source: str = Form(...),
    preset: str = Form(""),
    replace: str = Form("false"),
) -> dict:
    if not file.filename:
        raise HTTPException(status_code=400, detail="Missing CSV file")
    content = await file.read()
    replace_flag = str(replace).lower() in ("true", "1", "yes", "on")
    try:
        return import_uploaded_csv(
            content,
            file.filename,
            source=source,
            preset=preset,
            replace=replace_flag,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


def _firearm_query(body: FirearmFields) -> FirearmQuery:
    return FirearmQuery(
        category=body.category,
        manufacturer=body.manufacturer,
        model=body.model,
        variant=body.variant,
        caliber=body.caliber,
        condition=body.condition,  # type: ignore[arg-type]
        barrel_length=body.barrel_length,
        upc=body.upc,
        mpn=body.mpn,
        exclude_tokens=body.exclude_tokens,
    )


def _deal_kwargs(body: DealAssumptions) -> dict:
    return {
        "context": body.context,
        "my_cost": body.my_cost,
        "street_retail": body.street_retail,
        "reference_msrp": body.reference_msrp,
        "buyer_premium_pct": body.buyer_premium_pct,
        "listing_addons": body.listing_addons,
        "target_profit": body.target_profit,
        "min_margin_pct": body.min_margin_pct,
        "transfer_fee": body.transfer_fee,
        "inbound_ship": body.inbound_ship,
        "sell_assumption": body.sell_assumption,
    }


@app.post("/api/valuate", dependencies=[Depends(require_api_key)])
def valuate(body: ValuateRequest) -> dict:
    query = _firearm_query(body)
    if not query.manufacturer or not query.model:
        raise HTTPException(status_code=400, detail="manufacturer and model are required")

    result = run_valuation(
        query,
        **_deal_kwargs(body),
        use_cache=body.use_cache,
        force_refresh=body.force_refresh,
        sample_only=body.sample_only,
    )
    return result.to_dict()


@app.post("/api/recompute", dependencies=[Depends(require_api_key)])
def recompute(body: RecomputeRequest) -> dict:
    """Re-run deal desk math on cached market data (no Outdoor Analytics fetch)."""
    query = _firearm_query(body)
    if not query.manufacturer or not query.model:
        raise HTTPException(status_code=400, detail="manufacturer and model are required")

    result = recompute_valuation(query, **_deal_kwargs(body))
    if result is None:
        raise HTTPException(
            status_code=404,
            detail=(
                "No cached market data for this firearm. "
                "Click Valuate first (with Live pricing enabled)."
            ),
        )
    return result.to_dict()
