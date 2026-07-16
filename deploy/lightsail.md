# Deploy Modular Market Desk on your existing Lightsail instance

You already run **desk.modulargunworks.com** (legacy) and **api.modulargunworks.com** on Lightsail. This app is the **new** desk (Next.js + SQLite). Run it **alongside** the old stack, then switch DNS when ready.

## Recommended URL

| Subdomain | App |
|-----------|-----|
| `https://desk.modulargunworks.com` | Legacy v0.4 (today) |
| `https://market.modulargunworks.com` (or `desk2.…`) | **This repo** (new desk) |

Use any hostname your reverse proxy already supports (Apache, Caddy, nginx, Traefik).

## One-time on the server

### 1. Clone / pull this repo on Lightsail

```bash
cd /opt   # or wherever your other apps live
git clone <your-repo-url> modular-market-desk
cd modular-market-desk
```

### 2. Create production `.env`

```bash
cp .env.example .env
nano .env
```

Required:

```env
DATABASE_URL=file:./data/desk.db
SESSION_VAULT_KEY=<same key you use locally — or generate new and re-save OA token>
GBA_API_BASE=https://api.gunbrokeranalytics.com/gba-portal-api
DESK_AUTH_SECRET=<long random string — required on the public internet>
```

Optional deal defaults are in `.env.example`.

### 3. Copy your working database (fastest)

From your Windows PC (has catalogs + vault already):

```powershell
scp C:\Users\micha\Projects\modular-market-desk\data\desk.db user@YOUR_LIGHTSAIL_IP:/opt/modular-market-desk/data/
```

Create `data/` on the server first if needed. This avoids re-importing all CSVs and keeps your OA token.

### 4. Build and start Docker

```bash
docker compose build
docker compose up -d
```

The app listens on **host port 3010** → container `3000` (so it won’t fight other apps on 3000/80/443).

Check:

```bash
curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3010/
```

### 5. Reverse proxy (match your existing pattern)

**nginx example** — add a server block:

```nginx
server {
    listen 443 ssl;
    server_name market.modulargunworks.com;

    # ssl_certificate ... (same cert pattern as desk/api)

    location / {
        proxy_pass http://127.0.0.1:3010;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 300s;   # GBA comp pulls can take 1–3 min
    }
}
```

Reload nginx, then open **https://market.modulargunworks.com**.

**Apache:** same idea — `ProxyPass / http://127.0.0.1:3010/` with long timeout.

### 6. DNS

In Route 53 (or your DNS host), add **A record**:

`market.modulargunworks.com` → Lightsail static IP (same as desk/api).

## After go-live

1. Open `https://market.modulargunworks.com/import` → confirm vault / catalogs.
2. Run one evaluate on a known gun (Glock 19 / Ruger 10/22).
3. Schedule Lightsail **snapshots** or backup `/opt/modular-market-desk/data/desk.db` nightly.

## OA full market sync (catalog + sold comps)

Pulls OA’s full manufacturer/model/caliber tree into `oa_catalog`, then sold + asking comps for every leaf into `oa_market_stats` / `oa_sold_comps`.

**In the Desk UI:** **/import** → Session Vault (`outdoor_analytics` / `market_api`) → **Sync everything (catalog + sold comps)**. Progress polls live. Resume skips leaves synced in the last ~6 days unless “Force” is checked.

**CLI** (recommended for overnight / cron — can take hours):

```bash
cd /opt/market-desk-v2
npm run oa:sync
# smoke: OA_SYNC_LIMIT=20 npm run oa:sync
# force refresh: OA_SYNC_FORCE=1 npm run oa:sync
```

Weekly cron example (Sunday 2 AM):

```cron
0 2 * * 0 cd /opt/market-desk-v2 && /usr/bin/npm run oa:sync >> /home/bitnami/oa-full-sync.log 2>&1
```

After a full sync, Desk can later evaluate from SQLite without calling OA on every click (token only needed for the weekly job).

## Updates

```bash
cd /opt/modular-market-desk
git pull
docker compose build
docker compose up -d
```

`desk.db` stays on the Docker volume — data survives redeploys.

## Cutover from legacy desk

When the new desk is trusted:

1. Point `desk.modulargunworks.com` proxy to port **3010** instead of the old static/API bundle, **or**
2. Redirect old desk URL to `market.…` and retire legacy containers.

The new app does **not** use `api.modulargunworks.com`; it calls GunBroker Analytics directly from Node with the vault token.

## Troubleshooting

| Issue | Fix |
|-------|-----|
| 502 / timeout on evaluate | Proxy `proxy_read_timeout` ≥ 300s |
| Empty comps | Re-save OA token on `/import` with production `SESSION_VAULT_KEY` |
| Empty wholesale | Copy `desk.db` or re-run CSV import on server |
| Port conflict | Change `3010:3000` in `docker-compose.yml` |
