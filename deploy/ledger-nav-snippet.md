# Ledger integration — Valuation desk link

Add one of these to the Ledger navigation (ledger.modulargunworks.com).

## New tab (recommended)

Link opens the desk in the same or a new tab:

```html
<a href="https://desk.modulargunworks.com" target="_blank" rel="noopener noreferrer">
  Valuation desk
</a>
```

## Embedded iframe

Single-window experience; desk must allow framing (nginx desk config has no X-Frame-Options deny by default):

```html
<iframe
  src="https://desk.modulargunworks.com"
  title="Modular Market Desk — Valuation"
  style="width:100%;min-height:90vh;border:0;"
></iframe>
```

## API key (if MMD_API_KEY is set on server)

Set `apiKey` in `web/public/config.json` on the server to match `engine/.env` `MMD_API_KEY`, or build with:

```bash
VITE_API_URL=https://api.modulargunworks.com VITE_API_KEY=your-key npm run build
```

The desk loads `config.json` at runtime, so editing `/var/www/desk/config.json` avoids rebuild.
