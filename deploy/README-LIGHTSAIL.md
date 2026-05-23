# Deploy Modular Market Desk on AWS Lightsail

Two-step handoff: **this repo** supplies deploy files; **SSH on Lightsail** runs them.

## URLs

| Host | Purpose |
|------|---------|
| `https://api.modulargunworks.com` | FastAPI + Playwright |
| `https://desk.modulargunworks.com` | Valuation desk (static Vite build) |
| `https://ledger.modulargunworks.com` | Existing Ledger — add a nav link to desk |

## 1. DNS (registrar or Route 53)

Point both subdomains at your Lightsail **static IP** (same IP as `ledger` if one instance):

| Type | Name | Value |
|------|------|-------|
| A | `api` | `<Lightsail static IP>` |
| A | `desk` | `<Lightsail static IP>` |

TTL 300 is fine. Wait a few minutes, then verify:

```bash
dig +short api.modulargunworks.com
dig +short desk.modulargunworks.com
```

## 2. SSH agent — server install

On the Lightsail instance:

```bash
curl -fsSL https://raw.githubusercontent.com/ModularGunworksLLC/modular-market-desk/main/deploy/lightsail-setup.sh -o /tmp/lightsail-setup.sh
# Or after git clone:
cd /opt/modular-market-desk && bash deploy/lightsail-setup.sh
```

Or manually:

```bash
sudo mkdir -p /opt/modular-market-desk
sudo chown $USER:$USER /opt/modular-market-desk
git clone https://github.com/ModularGunworksLLC/modular-market-desk.git /opt/modular-market-desk
cd /opt/modular-market-desk
cp engine/.env.example engine/.env   # edit MMD_API_KEY=...
bash deploy/lightsail-setup.sh
```

### Reverse proxy + TLS

**Ledger uses Bitnami Apache** on the same instance. Desk/API add **new** vhost files only (`mmd-api.conf`, `mmd-desk.conf`) — see [ECOSYSTEM.md](ECOSYSTEM.md).

**Bitnami (recommended for your server):**

```bash
bash deploy/bitnami-apache-enable.sh
sudo /opt/bitnami/bncert-tool   # add api.modulargunworks.com and desk.modulargunworks.com
```

**Plain nginx (other hosts):**

```bash
sudo cp deploy/nginx-api.conf.example /etc/nginx/sites-available/mmd-api
sudo cp deploy/nginx-desk.conf.example /etc/nginx/sites-available/mmd-desk
sudo ln -sf /etc/nginx/sites-available/mmd-api /etc/nginx/sites-enabled/
sudo ln -sf /etc/nginx/sites-available/mmd-desk /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d api.modulargunworks.com -d desk.modulargunworks.com
```

### Verify

```bash
curl -s https://api.modulargunworks.com/health | jq .
```

Open `https://desk.modulargunworks.com`, search a gun, check **Sources** after Valuate.

## 3. GunBroker session (your Windows PC)

Scraping improves when valid cookies exist on the server:

```powershell
cd C:\Users\micha\Projects\modular-market-desk\engine
.\.venv\Scripts\Activate.ps1
python -m mmd_engine.cli.market_auth gunbroker
```

Upload to Lightsail:

```powershell
cd C:\Users\micha\Projects\modular-market-desk
$env:MMD_SSH_HOST = "ubuntu@<lightsail-ip>"   # or user@host
$env:MMD_SSH_USER = "ubuntu"                  # optional if in host string
.\scripts\push-sessions.ps1
```

Restart API on server after upload:

```bash
cd /opt/modular-market-desk && docker compose restart api
```

## 4. Ledger nav link (optional)

In the Ledger app, add a tab or menu item:

```html
<a href="https://desk.modulargunworks.com" target="_blank" rel="noopener">Valuation desk</a>
```

Or embed: `<iframe src="https://desk.modulargunworks.com" title="Valuation desk" />`

## Persistent data

Docker bind-mounts (see `docker-compose.yml`):

- `engine/data/sessions/` — Playwright cookies (GunBroker, dealers)
- `engine/data/valuation_cache/` — cached valuations
- `engine/data/imports/` — wholesale CSV data

Back up these directories before instance rebuilds.

## Update after git push

```bash
cd /opt/modular-market-desk
git pull
docker compose build && docker compose up -d
cd web && VITE_BASE_PATH=/ npm ci && npm run build
sudo cp -r dist/* /var/www/desk/
```

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Sources show `blocked` / 0 listings | Run `market_auth gunbroker` on PC, `push-sessions.ps1`, restart API |
| 401 on Valuate | Set same `MMD_API_KEY` in `engine/.env` and `web/public/config.json` `apiKey` |
| Desk blank / 404 assets | Rebuild with `VITE_BASE_PATH=/` (production) |
| API not reachable | `docker compose ps`, `curl http://127.0.0.1:8000/health` |
