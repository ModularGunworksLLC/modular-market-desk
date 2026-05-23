# SSH agent — copy-paste brief

Deploy **Modular Market Desk** on this Lightsail instance.

**Repo:** https://github.com/ModularGunworksLLC/modular-market-desk  
**Docs:** `deploy/README-LIGHTSAIL.md`

## 1. Recon (report back)

```bash
uname -a
docker --version
docker compose version
nginx -v 2>/dev/null || caddy version 2>/dev/null || echo "no nginx/caddy"
df -h
free -h
ls /etc/nginx/sites-enabled/ 2>/dev/null || true
grep -r ledger /etc/nginx/sites-enabled/ 2>/dev/null | head -5 || true
curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8000/health 2>/dev/null || echo "8000 closed"
```

## 2. Install

```bash
sudo mkdir -p /opt/modular-market-desk
sudo chown $USER:$USER /opt/modular-market-desk
git clone https://github.com/ModularGunworksLLC/modular-market-desk.git /opt/modular-market-desk
cd /opt/modular-market-desk
cp engine/.env.example engine/.env
# Edit engine/.env — set MMD_API_KEY
nano engine/.env
bash deploy/lightsail-setup.sh
```

## 3. Apache (Bitnami) or nginx + TLS

**Do not edit** `ledger-vhost.conf` / `ledger-https-vhost.conf`.

Bitnami:

```bash
bash deploy/bitnami-apache-enable.sh
sudo /opt/bitnami/bncert-tool
```

nginx-only hosts: see `deploy/README-LIGHTSAIL.md`.

## 4. Verify

```bash
curl -s https://api.modulargunworks.com/health
curl -sI https://desk.modulargunworks.com | head -5
```

**Do not** modify ledger app configs without approval.

**Sessions:** GunBroker cookies come from the owner's PC via `scripts/push-sessions.ps1` after deploy.
