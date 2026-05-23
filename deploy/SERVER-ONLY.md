# Server-only operation (no desktop required)

Run **everything** on Lightsail: API, desk UI, credentials, sessions, CSV imports, and session refresh.

Your PC is only needed **once** to copy secrets to the server (or type them in over SSH). After that, use SSH or Cursor **Remote SSH** on the instance.

## What lives on the server

| Item | Path on Lightsail |
|------|-------------------|
| App code | `/opt/modular-market-desk` |
| API (Docker) | `127.0.0.1:8000` |
| Desk UI | `/var/www/desk` |
| API key + wholesale env vars | `/opt/modular-market-desk/engine/.env` |
| All vendor passwords | `/opt/modular-market-desk/engine/sites.local.yaml` |
| Login cookies (sessions) | `/opt/modular-market-desk/engine/data/sessions/` |
| Imported CSV catalogs | `/opt/modular-market-desk/engine/data/imports/` |
| Valuation cache | `/opt/modular-market-desk/engine/data/valuation_cache/` |

Ledger stays separate under `/home/bitnami/Bankledger`.

## One-time: move secrets from PC to server

**Option A — copy your existing file (easiest if you already use `sites.local.yaml` on PC):**

```powershell
scp C:\Users\micha\Projects\modular-market-desk\engine\sites.local.yaml modulargunworks:/opt/modular-market-desk/engine/sites.local.yaml
scp C:\Users\micha\Projects\modular-market-desk\engine\.env modulargunworks:/opt/modular-market-desk/engine/.env
```

**Option B — edit on the server only:**

```bash
ssh modulargunworks
cd /opt/modular-market-desk/engine
cp sites.local.yaml.example sites.local.yaml
cp .env.example .env
nano sites.local.yaml   # enabled: true + username/password per vendor
nano .env               # MMD_API_KEY, optional LIPSEYS_USER, etc.
chmod 600 sites.local.yaml .env
```

Then recreate the API container so it mounts `sites.local.yaml`:

```bash
cd /opt/modular-market-desk
git pull
sudo docker compose up -d --force-recreate api
```

## Refresh all vendor + market sessions (on server)

```bash
cd /opt/modular-market-desk
bash deploy/server-auth-all.sh
```

This runs **inside Docker** (headless Playwright):

- GunBroker / Gun.deals (auto-login from `sites.local.yaml`)
- Every **enabled** dealer with credentials (Lipsey's, Zanders, …)

Check status:

```bash
docker compose exec api python -m mmd_engine.cli.credentials_cmd
curl -s https://api.modulargunworks.com/health | python3 -m json.tool
```

## Weekly auto-refresh (optional cron)

```bash
crontab -e
```

Add:

```cron
0 6 * * 1 cd /opt/modular-market-desk && bash deploy/server-auth-all.sh >> /var/log/mmd-auth.log 2>&1
```

## Import wholesale CSV on server

Upload file:

```bash
scp your-lipseys-export.csv modulargunworks:/opt/modular-market-desk/engine/data/imports/
```

Import inside container:

```bash
cd /opt/modular-market-desk
docker compose exec api python -m mmd_engine.cli.import_csv \
  -s lipseys -f /app/data/imports/your-lipseys-export.csv -p lipseys
```

## Update app after `git push`

```bash
cd /opt/modular-market-desk
git pull
sudo docker compose build && sudo docker compose up -d
bash deploy/server-build-desk.sh
```

## MFA / Cloudflare sites

Headless auto-login works for many sites (GunBroker, Lipsey's, etc.). If a vendor **requires SMS MFA** every time, you have two options:

1. **SSH + X11** (rare): forward display and run `docker compose exec -it api python -m mmd_engine.cli.auth zanders` without `--headless`.
2. **Refresh session on a PC once**, then `scp` only that site's `engine/data/sessions/zanders.json` to the server — still no daily PC use.

Most sites keep cookies for weeks; weekly `server-auth-all.sh` is enough.

## What you stop doing on desktop

- `start-api.ps1` / local Vite dev (use https://desk.modulargunworks.com)
- `push-sessions.ps1` / `sync-gunbroker-session.ps1` (use `server-auth-all.sh`)
- Keeping Playwright browsers on Windows for production

## Desktop optional uses

- Developing code (git push)
- First-time secret upload (`scp`)
- Fixing a stubborn MFA login (one session file upload)
