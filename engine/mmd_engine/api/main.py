"""FastAPI entrypoint for Modular Market Desk."""

from __future__ import annotations

import os

from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from mmd_engine.config import api_key
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
    use_cache: bool = True
    sample_only: bool = False


def require_api_key(x_api_key: str | None = Header(default=None)) -> None:
    expected = api_key()
    if not expected:
        return
    if x_api_key != expected:
        raise HTTPException(status_code=401, detail="Invalid API key")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "modular-market-desk", "version": "0.3.0"}


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
        use_cache=body.use_cache,
        sample_only=body.sample_only,
    )
    return result.to_dict()
