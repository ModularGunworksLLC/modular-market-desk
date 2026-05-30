# Market pricing source

## Outdoor Analytics only (default)

Live **sold comps** and **active listings** come from the **GunBroker Analytics hub API** (Outdoor Analytics), not from scraping GunBroker or TrueGunValue.

| Source | Session | What you get |
|--------|---------|--------------|
| **Outdoor Analytics** | `engine/data/sessions/outdoor_analytics.json` | Sold history + active listings for a catalog model/caliber |

**Token setup on your PC:**

```powershell
.\scripts\save-oa-token.ps1
.\scripts\sync-oa-session.ps1 -UploadOnly
```

**Server:** API container must use `network_mode: host` in `docker-compose.yml` so it can reach `api.gunbrokeranalytics.com`.

Wholesale CSV (Lipsey's, Zanders imports) is still used only for **dealer cost**, not street pricing.

## Legacy scrapers (disabled)

TrueGunValue, GunBroker, and Gun.deals browser scrapers are **off** unless you set `MMD_LEGACY_MARKET_SCRAPERS=1` in `engine/.env`. They are blocked on most cloud IPs and are not needed when OA is configured.
