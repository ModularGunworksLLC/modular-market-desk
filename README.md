# Modular Market Desk

**Modular Gunworks LLC** — Single-Item Valuation Desk (TrueGunValue-style, multi-source).

Enter one firearm, pick your business context (auction / vendor promo / margin), and get sold comps, retail asking prices, wholesale CSV costs, and actionable insights.

## Architecture

| Part | Role |
|------|------|
| [`web/`](web/) | Valuation UI (GitHub Pages): structured search, summary, tabs |
| [`engine/`](engine/) | FastAPI + Playwright adapters (GunBroker, TrueGunValue, CSV wholesale) |

## Quick start

### API

```powershell
cd engine
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
pip install -e .
playwright install chromium
uvicorn mmd_engine.api.main:app --reload --port 8000
```

### Dashboard

```powershell
cd web
npm install
npm run dev
```

Open http://localhost:5173/modular-market-desk/ — set `apiUrl` in [`web/public/config.json`](web/public/config.json) (default `http://localhost:8000`).

### Import wholesale CSV (Lipsey's, Zanders, …)

```powershell
cd engine
.\.venv\Scripts\Activate.ps1
python -m mmd_engine.cli.import_csv -s lipseys -f data/imports/examples/lipseys_sample.csv -p lipseys
```

Presets: [`engine/config/csv_presets/`](engine/config/csv_presets/) (`lipseys`, `zanders`, `generic`).

### Valuate via API

`POST http://localhost:8000/api/valuate`

```json
{
  "manufacturer": "Sig Sauer",
  "model": "P226",
  "caliber": "9mm",
  "condition": "used",
  "context": "auction_sniper",
  "my_cost": 450
}
```

## Context modes

| Mode | Insight |
|------|---------|
| `auction_sniper` | Suggested max bid from 90d sold P75 minus fees and target profit |
| `vendor_deal` | Whether your cost is below retail street low |
| `margin_spotter` | Street low minus your cost (margin % ) |

## Environment (`engine/.env`)

```
MMD_AUCTION_FEES_PCT=13
MMD_TARGET_PROFIT=75
MMD_API_KEY=optional-for-production
```

## GitHub

**Repository:** https://github.com/ModularGunworksLLC/modular-market-desk

**Live dashboard (GitHub Pages):** https://modulargunworksllc.github.io/modular-market-desk/

Push to `main` triggers the Pages deploy workflow. For live valuation from the deployed site, host the API and set `apiUrl` in `web/public/config.json` to your API host.

## Security

Never commit `.env`, `engine/data/sessions/`, or real inventory CSVs with pricing.
