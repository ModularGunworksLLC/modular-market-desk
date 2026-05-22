# Start here — Modular Market Desk

Everything is set up. Use this checklist.

## Already done for you

- GitHub repo: https://github.com/ModularGunworksLLC/modular-market-desk
- Live UI: https://modulargunworksllc.github.io/modular-market-desk/
- Python engine + Playwright installed
- Sample Lipsey's CSV imported (3 items)
- API running locally on port 8000

## Use the app (easiest — local)

Double-click or run:

```powershell
cd C:\Users\micha\Projects\modular-market-desk
.\scripts\start-all.ps1
```

Open http://localhost:5173/modular-market-desk/

Example search: Manufacturer `Glock`, Model `G19`, Caliber `9mm`

## Use the public website with live Valuate

The public Pages site needs a **public API**. Two options:

### Option A — Quick tunnel (PC must stay on)

1. Start API: `.\scripts\start-api.ps1`
2. Start tunnel: `.\scripts\start-tunnel.ps1`
3. Copy the `https://....trycloudflare.com` URL into `web/public/config.json` → `apiUrl`
4. `cd web; npm run build; cd ..; git add web/public/config.json; git commit -m "Update API URL"; git push`

### Option B — Permanent API on Render (recommended)

1. Open https://dashboard.render.com/select-repo?type=blueprint
2. Connect repo **ModularGunworksLLC/modular-market-desk**
3. Deploy the blueprint (`render.yaml` creates the API service)
4. Copy your Render URL (e.g. `https://modular-market-desk-api.onrender.com`)
5. Set `apiUrl` in `web/public/config.json`, rebuild web, push to GitHub

## Import your wholesale CSV

```powershell
cd engine
.\.venv\Scripts\Activate.ps1
python -m mmd_engine.cli.import_csv -s lipseys -f "C:\path\to\your\export.csv" -p lipseys
```

Presets: `lipseys`, `zanders`, `generic` in `engine/config/csv_presets/`.

## Re-run full setup anytime

```powershell
.\scripts\setup-all.ps1
```
