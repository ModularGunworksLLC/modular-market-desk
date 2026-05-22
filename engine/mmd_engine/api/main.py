"""FastAPI entrypoint for live search."""

from __future__ import annotations

import os

from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from mmd_engine.config import api_key
from mmd_engine.filters import SearchFilters
from mmd_engine.service.search import run_search

app = FastAPI(title="Modular Market Desk API", version="0.2.0")

_origins = os.getenv(
    "MMD_CORS_ORIGINS",
    "http://localhost:5173,https://*.github.io",
).split(",")

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


def require_api_key(x_api_key: str | None = Header(default=None)) -> None:
    expected = api_key()
    if not expected:
        return
    if x_api_key != expected:
        raise HTTPException(status_code=401, detail="Invalid API key")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "modular-market-desk", "version": "0.2.0"}


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
