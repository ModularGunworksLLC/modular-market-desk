# Modular Market Desk

**Modular Gunworks LLC** — private firearms margin research tool.

Compare dealer/wholesale cost against public market comps to evaluate buy and resale opportunities.

## Architecture

| Part | Role |
|------|------|
| [`web/`](web/) | Static dashboard (GitHub Pages): search, filters, margin table, live lookup |
| [`engine/`](engine/) | Python scrapers + FastAPI (local or Docker; Railway/Render for production) |

**Phase 1:** Cached JSON + instant search on GitHub Pages.  
**Phase 2:** Gun.deals + Lipsey's + Zanders adapters (Playwright).  
**Phase 3:** Hosted API for on-demand **Live lookup**.

## Quick start

### Dashboard (local)

```powershell
cd web
npm install
npm run dev
```

Open http://localhost:5173/modular-market-desk/

### Refresh cached data

```powershell
cd engine
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
pip install -e .
playwright install chromium
python -m mmd_engine.cli.sync --query "glock 19"
```

Use `--sample-only` to skip external sites. Writes `web/public/data/bundle.json`.

### Dealer login (Lipsey's / Zanders)

1. Copy `engine/.env.example` → `engine/.env` and add credentials (optional for headed login).
2. Save session (complete MFA in the browser window):

```powershell
python -m mmd_engine.cli.auth lipseys --headed
python -m mmd_engine.cli.auth zanders --headed
```

Sessions are stored in `engine/data/sessions/` (gitignored).

### Live search API (local)

```powershell
cd engine
.\.venv\Scripts\Activate.ps1
uvicorn mmd_engine.api.main:app --reload --port 8000
```

Or: `docker compose up` from the repo root.

Enable live lookup in the dashboard:

- **Local:** set `apiUrl` in `web/public/config.json` to `http://localhost:8000`
- **Production:** deploy the engine API and set `apiUrl` + `apiKey` in `config.json`, or use GitHub Actions secrets `VITE_API_URL` / `VITE_API_KEY` at build time

### GitHub Pages

1. Create repo `modular-market-desk` on GitHub.
2. Push to `main`.
3. **Settings → Pages → Source:** GitHub Actions.
4. Optional secrets: `VITE_API_URL`, `VITE_API_KEY` for live lookup on the deployed site.
5. URL: `https://<org>.github.io/modular-market-desk/`

Manual data refresh: **Actions → Sync catalog data → Run workflow**.

## Security

- Never commit `.env`, `engine/data/sessions/`, or API keys in public `config.json`.
- Set `MMD_API_KEY` on the API in production.
- Gun.deals uses Cloudflare; live scrapes may fail in CI — run sync locally when needed.

## Company links

Edit `web/public/config.json`:

```json
{
  "companySiteUrl": "https://your-modular-gunworks-site.com",
  "ledgerUrl": "https://your-ledger-app.com",
  "apiUrl": "https://your-api.example.com",
  "apiKey": ""
}
```
