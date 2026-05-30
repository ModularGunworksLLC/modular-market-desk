#!/usr/bin/env python3
from mmd_engine.oa_session import load_bearer_token
from mmd_engine.service.valuation import run_valuation
from mmd_engine.valuation_models import FirearmQuery

t = load_bearer_token()
print("token_len", len(t or ""))
q = FirearmQuery(
    manufacturer="Glock",
    model="30",
    variant="Gen 5",
    caliber="45 ACP",
    condition="new",
)
r = run_valuation(q, force_refresh=True)
print("listings", len(r.listings))
print("source_status", r.source_status)
print("sold", r.sold_stats.count, "asking", r.asking_stats.count)
