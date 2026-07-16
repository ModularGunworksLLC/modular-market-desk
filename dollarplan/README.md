# DollarPlan — personal zero-based budget (manual first, Plaid-ready)

Standalone Next.js app for household budgeting. Runs on Lightsail like Modular Market Desk.

## Tests

```bash
npm test          # run all unit + integration tests
npm run test:watch
```

| Suite | Covers |
|-------|--------|
| `math.test.ts` | Zero-based math, spent-by-line aggregation |
| `validation.test.ts` | Zod API request schemas |
| `format.test.ts` | Money and month formatting |
| `plaid/config.test.ts` | Plaid env detection |
| `vault.test.ts` | Token encryption round-trip |
| `*.integration.test.ts` | Budget + transaction services against isolated SQLite |

```bash
cd dollarplan
npm install
npm run db:generate
npm run db:init
npm run dev
```

Open http://localhost:3001

## Plaid later

Tables `plaid_items`, `plaid_accounts`, and transaction columns `plaid_transaction_id` / `source` are in place. To enable bank sync later:

1. Copy `.env.example` to `.env`
2. Set `PLAID_CLIENT_ID`, `PLAID_SECRET`, `PLAID_ENV`, and `SESSION_VAULT_KEY`
3. Implement `/api/plaid/link` and sync job using `ingestExternalTransaction()` in `src/lib/services/transactions.ts`

Until then, all transactions use `source: manual`.

## Deploy (Lightsail)

```bash
docker build -t dollarplan .
docker run -p 3001:3000 -v dollarplan-data:/app/data --env-file .env dollarplan
```
