# Start here — Modular Market Desk

Everything is set up. Use this checklist.

## Already done for you

- GitHub repo: https://github.com/ModularGunworksLLC/modular-market-desk
- Live UI: https://modulargunworksllc.github.io/modular-market-desk/
- Python engine + Playwright installed
- Sample Lipsey's CSV imported (3 items)
- API running locally on port 8000

## Live comps show “no sold data in 90 days”?

Usually **not** the 90-day filter — live scrapers returned **zero listings**:

1. Install Playwright browsers (once):
   ```powershell
   cd engine
   .\.venv\Scripts\Activate.ps1
   playwright install chromium
   ```
2. Restart the API (`.\scripts\start-api.ps1`).
3. Uncheck **Sample data only** in the UI.
4. Check **Sources** after Valuate: `gunbroker` / `truegunvalue` should say `ok (N listings)`. If you see `no listings` or Cloudflare, TrueGunValue/GunBroker blocked the headless browser.

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

## Store your dealer logins (one place)

**Production deploy:** [deploy/README-LIGHTSAIL.md](deploy/README-LIGHTSAIL.md) · SSH brief: [deploy/SSH-AGENT-BRIEF.md](deploy/SSH-AGENT-BRIEF.md)

**Option A — YAML file (good for many sites):**

```powershell
cd engine
copy sites.local.yaml.example sites.local.yaml
# Edit sites.local.yaml — set enabled: true and your username/password per site
python -m mmd_engine.cli.credentials_cmd
```

**Option B — `.env` file:**

```powershell
copy .env.example .env
# Edit .env — LIPSEYS_USER, LIPSEYS_PASS, ZANDERS_USER, etc.
```

**Age gates (21+ / Enter):** the engine auto-clicks common “Yes / Enter / I am 21” buttons on every dealer page load. The choice is stored in your Playwright session file after the first headed login — you usually only fight the gate once per site. If a site uses a weird layout, click through manually during `cli.auth`, then press Enter.

**Sites with MFA (text code, CAPTCHA):** after saving passwords, run once per site:

```powershell
python -m mmd_engine.cli.auth lipseys
python -m mmd_engine.cli.auth zanders
```

Sessions are saved in `engine/data/sessions/` (gitignored). Never commit `sites.local.yaml` or `.env`.

Your wholesale list is pre-loaded in `sites.local.yaml.example` (Lipsey's, Zanders, Davidson's, Sports South, 2nd Amendment, Orion, Chattanooga, Primary Arms, ZRO Delta, Lakeline, etc.). **Kroll** and **Hicks** are marked excluded. **RSR** is gear-only (no firearms).

Live adapters today: **Lipsey's**, **Zanders**. Others store credentials until adapters are built.

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
