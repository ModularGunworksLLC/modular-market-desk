# Live market sources (TrueGunValue, GunBroker, Gun.deals)

Every **live** Valuate call already queries all three in parallel (unless `MMD_SERIALIZE_MARKET_SCRAPERS=1`).

| Source | Adapter | Session file | What you get |
|--------|---------|--------------|--------------|
| **TrueGunValue** | `truegunvalue` | None (public pages) | Sold history, averages, estimates |
| **GunBroker** | `gunbroker` | `data/sessions/gunbroker.json` | Completed + active listings |
| **Gun.deals** | `gundeals` | `data/sessions/gundeals.json` | Retail asking promos |

Wholesale CSV + Lipsey's/Zanders are separate adapters.

## Why Lightsail often returns 0 listings

1. **Timeouts** — pages never finish loading in 90s from AWS IPs  
2. **Cloudflare** — TrueGunValue / Gun.deals challenge datacenter browsers  
3. **GunBroker** — needs fresh cookies; session file can expire  
4. **RAM** — three headless browsers at once on a small instance  

## Server tuning (`engine/.env`)

```bash
MMD_NAV_TIMEOUT_MS=180000
MMD_NAV_WAIT_UNTIL=commit
MMD_SERIALIZE_MARKET_SCRAPERS=1
MMD_MARKET_HEADLESS=true
```

Then rebuild and restart:

```bash
cd /opt/modular-market-desk
git pull
sudo docker compose build && sudo docker compose up -d
bash deploy/server-auth-all.sh
```

## Sessions (GunBroker + Gun.deals)

```bash
bash deploy/server-auth-all.sh
```

Or from your PC once, then copy only session JSON files to  
`/opt/modular-market-desk/engine/data/sessions/`.

TrueGunValue has no login in this app — it relies on passing Cloudflare in headless mode.

## Hybrid workflow (most reliable today)

1. On your **Windows PC** (home IP), run Valuate once with API pointed at localhost or tunnel.  
2. Results are saved under `engine/data/valuation_cache/`.  
3. Copy cache to server:

```powershell
scp -r engine\data\valuation_cache\* modulargunworks:/opt/modular-market-desk/engine/data/valuation_cache/
```

4. On desk: **uncheck** “Search the web now”, **check** use cache path via unchecking force refresh — or API `use_cache: true`.

## Desk checklist for best TGV slugs

- **Manufacturer:** Glock  
- **Model:** 30  
- **Variant:** Gen 5  
- **Caliber:** 45 ACP  

TGV URLs look like:  
`https://truegunvalue.com/pistol/glock-glock-30-45-acp/price-historical-value`

## Verify on server

```bash
docker compose exec api python -c "
from mmd_engine.valuation_models import FirearmQuery
from mmd_engine.adapters.truegunvalue import TrueGunValueAdapter
q = FirearmQuery(category='handgun', manufacturer='Glock', model='30', variant='Gen 5', caliber='45 ACP', condition='used')
rows = TrueGunValueAdapter().fetch(q)
print('tgv rows', len(rows))
"
```

## Future options

- Residential proxy (`MMD_PROXY_SERVER` — not implemented yet)  
- Dedicated “scraper” Lightsail with more RAM  
- TrueGunValue session capture if they add login walls everywhere  
