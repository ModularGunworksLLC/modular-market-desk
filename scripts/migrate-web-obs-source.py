#!/usr/bin/env python3
"""Add web_price_observations source/kind/geo if missing (pre-market-bank SQLite)."""
import sqlite3

db = sqlite3.connect("/opt/market-desk-v2/data/desk.db")
cols = {r[1] for r in db.execute("PRAGMA table_info(web_price_observations)")}
print("before:", sorted(cols))
for name, ddl in [
    ("source", "ALTER TABLE web_price_observations ADD COLUMN source text NOT NULL DEFAULT 'tavily'"),
    ("kind", "ALTER TABLE web_price_observations ADD COLUMN kind text NOT NULL DEFAULT 'ask'"),
    ("geo", "ALTER TABLE web_price_observations ADD COLUMN geo text NOT NULL DEFAULT 'national'"),
]:
    if name in cols:
        print(f"skip {name}")
        continue
    db.execute(ddl)
    print(f"added {name}")
db.execute("CREATE INDEX IF NOT EXISTS web_price_obs_source_idx ON web_price_observations (source)")
db.commit()
cols = {r[1] for r in db.execute("PRAGMA table_info(web_price_observations)")}
print("after:", sorted(cols))
db.close()
