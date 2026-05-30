#!/usr/bin/env python3
import time
from mmd_engine.oa_session import load_bearer_token
from mmd_engine.clients.gba_api import GbaApiClient

t0 = time.time()
c = GbaApiClient(load_bearer_token())
print("auth/me", c.auth_me(), "sec", round(time.time() - t0, 1))
t1 = time.time()
mfrs = c.get("/pricing/manufacturers", params={"condition": "New"})
print("manufacturers", len(mfrs) if isinstance(mfrs, list) else mfrs, "sec", round(time.time() - t1, 1))
t2 = time.time()
try:
    deps = c.pricing_dependencies()
    print("deps keys", list(deps.keys()), "sec", round(time.time() - t2, 1))
except Exception as e:
    print("deps failed", e, "sec", round(time.time() - t2, 1))
