# Ecosystem isolation

Modular Market Desk is **independent** of the Ledger app.

| App | Repo | Host | Process / path |
|-----|------|------|----------------|
| Ledger | `ModularGunworksLedger` | `ledger.modulargunworks.com` | Flask ~5001, own clone — **do not modify** |
| Valuation desk UI | `modular-market-desk` | `desk.modulargunworks.com` | Static files in `/var/www/desk` |
| Valuation API | `modular-market-desk` | `api.modulargunworks.com` | Docker `127.0.0.1:8000` only |

## What we never touch for desk deploy

- Ledger git clone, `backend/`, React build, or nginx site for `ledger.modulargunworks.com`
- Ledger `.env`, `credentials.json`, or Google Drive backup logic

## Optional link only

The desk UI may **read** `ledgerUrl` from `web/public/config.json` (opens Ledger in a new tab). That is a client-side URL only — no shared database or API.

## nginx

Desk/API use **separate** `sites-available` files (`mmd-api`, `mmd-desk`). Enabling them does not change the ledger server block.

## Data

All scrape sessions, cache, and CSV imports live under `modular-market-desk/engine/data/` on the server, bind-mounted into the API container — not in the Ledger project tree.
