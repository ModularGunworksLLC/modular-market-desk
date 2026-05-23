"""FastAPI entrypoint for Modular Market Desk."""

from __future__ import annotations

import time

from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from mmd_engine.config import SESSIONS_DIR, api_key
from mmd_engine.filters import SearchFilters
from mmd_engine.service.search import run_search
from mmd_engine.service.valuation import run_valuation
from mmd_engine.valuation_models import ContextMode, FirearmQuery

app = FastAPI(title="Modular Market Desk API", version="0.3.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)


class SearchRequest(BaseModel):
    q: str = ""
    semi_auto_only: bool = False
    in_stock_only: bool = False
    on_sale_only: bool = False
    min_margin_pct: float = 0


class ValuateRequest(BaseModel):
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
    context: ContextMode = "auction_sniper"
    my_cost: float | None = None
    street_retail: float | None = None
    reference_msrp: float | None = None
    buyer_premium_pct: float | None = None
    listing_addons: float | None = None
    use_cache: bool = False
    force_refresh: bool = True
    sample_only: bool = False


def require_api_key(x_api_key: str | None = Header(default=None)) -> None:
    expected = api_key()
    if not expected:
        return
    if x_api_key != expected:
        raise HTTPException(status_code=401, detail="Invalid API key")


_MARKET_SESSIONS = ("gunbroker", "gundeals")


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
    }


@app.get("/health")
def health() -> dict:
    sessions = {name: _session_info(name) for name in _MARKET_SESSIONS}
    missing = [n for n, info in sessions.items() if not info["exists"]]
    return {
        "status": "ok",
        "service": "modular-market-desk",
        "version": "0.3.0",
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


@app.post("/api/valuate", dependencies=[Depends(require_api_key)])
def valuate(body: ValuateRequest) -> dict:
    query = FirearmQuery(
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
    if not query.manufacturer or not query.model:
        raise HTTPException(status_code=400, detail="manufacturer and model are required")

    result = run_valuation(
        query,
        context=body.context,
        my_cost=body.my_cost,
        street_retail=body.street_retail,
        reference_msrp=body.reference_msrp,
        buyer_premium_pct=body.buyer_premium_pct,
        listing_addons=body.listing_addons,
        use_cache=body.use_cache,
        force_refresh=body.force_refresh,
        sample_only=body.sample_only,
    )
    return result.to_dict()
