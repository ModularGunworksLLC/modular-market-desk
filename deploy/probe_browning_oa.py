#!/usr/bin/env python3
from mmd_engine.adapters.outdoor_analytics import resolve_selection
from mmd_engine.clients.gba_api import GbaApiClient
from mmd_engine.oa_session import load_bearer_token
from mmd_engine.valuation_models import FirearmQuery

q = FirearmQuery(
    manufacturer="BROWNING",
    model="1911-380",
    caliber=".380 ACP",
    condition="used",
)
c = GbaApiClient(load_bearer_token())
d = c.pricing_dependencies()
s = resolve_selection(d, q)
print("selection:", s)
rows = c.pricing_data(
    model_id=s.model_id,
    caliber_id=s.caliber_id,
    condition="Used",
)
print("sold_rows", len(rows))
if rows:
    print("keys", list(rows[0].keys()))
    print("first", rows[0])
