# Modular Market Desk

High-speed firearm **arbitrage calculator**. Enter a gun you can buy (auction lot or wholesaler
special); the desk cross-references distributor catalogs and GunBroker Analytics market comps to
return a **GO / NO-GO** verdict and an absolute **Max Bid**.

Stack: Next.js (App Router) + React 19 + Tailwind + Drizzle ORM on Neon Postgres. Ships as one
Dockerized Node app for AWS Lightsail.

## Repository map

```
modular-market-desk/
├─ .cursorrules               # master rules: fee schedules, 9% AL tax, Max Bid, ingestion contracts
├─ .env.example               # DATABASE_URL, GBA_API_BASE, SESSION_VAULT_KEY, deal defaults
├─ drizzle.config.ts          # drizzle-kit (migrations -> ./drizzle)
├─ next.config.mjs            # output: "standalone" for the Lightsail image
├─ tailwind.config.ts         # command-center palette + 3xl/4xl ultrawide breakpoints
├─ src/
│  ├─ app/
│  │  ├─ layout.tsx           # root layout + viewport
│  │  ├─ page.tsx             # the desk: responsive form + verdict/Max Bid + grids
│  │  ├─ globals.css          # tailwind layers + .panel/.field/.num components
│  │  └─ api/
│  │     └─ evaluate/route.ts # POST: two-avenue eval -> engine -> persist
│  └─ lib/
│     ├─ arbitrage/           # PURE math engine (no I/O, fully unit-tested)
│     │  ├─ constants.ts      #   fee tiers, tax rate, env deal defaults  (THE CONTRACT)
│     │  ├─ fees.ts           #   tiered FVF, card processing, round2
│     │  ├─ routes.ts         #   Route A (GunBroker) / Route B (Local AL tax back-out)
│     │  ├─ acquisition.ts    #   all-in cost (premium + inbound)
│     │  ├─ stats.ts          #   P25/Median/P75 percentiles
│     │  ├─ maxBid.ts         #   hammer ceiling inverted from net
│     │  ├─ verdict.ts        #   GO / NO-GO
│     │  ├─ evaluate.ts       #   orchestrator -> EvaluationResult
│     │  ├─ types.ts
│     │  └─ arbitrage.test.ts #   vitest (incl. the $399 local worked example)
│     ├─ db/
│     │  ├─ schema.ts         # connections, csv_presets, catalog_items, valuations
│     │  └─ index.ts          # drizzle + postgres.js singleton pool
│     ├─ gba/client.ts        # GunBroker Analytics API client (bearer, /pricing/*)
│     ├─ csv/
│     │  ├─ presets.ts        # default header maps for the 4 distributors
│     │  └─ importer.ts       # streamed, 500-row batched UPSERT importer
│     ├─ vault.ts             # AES-256-GCM Session Vault crypto
│     ├─ connections.ts       # read/decrypt the active market token
│     ├─ wholesale.ts         # distributor cross-reference grid
│     ├─ canonical.ts         # canonical identity key
│     └─ validation.ts        # zod request schema
└─ drizzle/                   # generated SQL migrations
```

## Getting started

```bash
cp .env.example .env          # fill DATABASE_URL (Neon), SESSION_VAULT_KEY, etc.
npm install
npm run db:push               # create tables on Neon
npm run test                  # prove the math engine
npm run dev                   # http://localhost:3000
```

The legacy v0.4 codebase is preserved on the `legacy-v0.4` git branch.
