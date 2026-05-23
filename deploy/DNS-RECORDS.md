# DNS for desk + api (Namecheap)

**Lightsail static IP (same instance as ledger):** `3.22.205.235`

In Namecheap → **modulargunworks.com** → **Advanced DNS**, add:

| Type | Host | Value | TTL |
|------|------|-------|-----|
| A | `api` | `3.22.205.235` | Automatic |
| A | `desk` | `3.22.205.235` | Automatic |

Do **not** change the existing `ledger` A record.

Verify (after 5–30 min):

```bash
dig +short api.modulargunworks.com
dig +short desk.modulargunworks.com
```

Then on the server:

```bash
cd /opt/modular-market-desk
bash deploy/bitnami-apache-enable.sh
sudo /opt/bitnami/bncert-tool
# Add: api.modulargunworks.com desk.modulargunworks.com
```

Smoke test:

```bash
curl -s https://api.modulargunworks.com/health
curl -sI https://desk.modulargunworks.com | head -5
```
