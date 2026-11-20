# Live baseline diff (2026-11-19)

Snapshot commit `57c1b2d` on `backup/live-2026-11-19` is the sanitized `/opt/market-desk-v2` tree (487 files). Its parent is `feature/sidekick` `f3e551c` so `git diff feature/sidekick` is one commit, not a merge. Compared here with whitespace ignored (`git diff -w`); a raw diff is much larger because many files were reformatted.

Also compared to `origin/cursor/oa-token-connect-12b0` `4e0403d`.

No `.env`, `data/`, or secrets are in the snapshot. `next-env.d.ts` and `dollarplan/next-env.d.ts` are in the tarball and are tracked even though `.gitignore` lists `next-env.d.ts`, so the git tree matches the snapshot.

## File counts

| Compared to | Added | Deleted | Modified | Notes |
|---|---:|---:|---:|---|
| `feature/sidekick` `f3e551c` | 31 | 36 | 270 | 337 paths in the snapshot commit. `src/` differs in 141 paths. |
| `cursor/oa-token-connect-12b0` `4e0403d` | same live additions | those, plus the OA-connect files below | pricing files match the sidekick delta | oa-token's pricing logic is sidekick plus the token-connect UI. Live does not contain that UI. |

Whitespace-ignored logic diff vs sidekick for pricing, matching, ingest, queue, and wholesale is about **+2813 / −537** lines across 38 files. Many other `src/` files differ only by formatting.

### Identical to both GitHub branches (logic that the live bugs still sit in)

- `src/lib/web-comps/queue.ts` — in-memory drip queue, 50/day cap, no persistence
- `src/lib/wholesale-match.ts` — still drops text matches more than 15% below the bid
- `src/lib/oa/sold-windows.ts`
- `src/app/api/web-comps/status/route.ts` and `enrich/route.ts`

### Added in live vs sidekick (src)

- Batch UI split: `BatchSheetTable.tsx`, `LotDetailPanel.tsx`, `RankedBuySheet.tsx`
- `src/lib/batch/csv.ts`, `call-display.ts`, `sanitize-identity.ts`
- `src/lib/auctions/http.ts`, `util.ts`, `hibid-catalog.ts`
- `src/lib/catalog-api-sync.ts`, `src/lib/client.ts`
- `src/lib/lipseys/client.ts` + `sync.ts`
- `src/lib/trade-in/ledger-handoff.ts`, `src/lib/wholesale-scan-candidates.ts`

### Removed vs sidekick

Tracked `tmp-pearce-*`, `tmp-hotgunz*`, and several `scripts/*` data dumps (montana/pearce/fowler). Not pricing code.

### Present on oa-token, absent from live

The whole OA token-connect feature: `src/app/oa-connect/*`, `src/components/desk/OaStatusBanner.tsx`, `src/app/import/ConnectOaCard.tsx`, `src/app/api/vault/oa/route.ts`, and `src/lib/oa/{bookmarklet,handoff,jwt,status,vault-store,live-label,config,desk-write-auth}.ts`. Live still pastes the bearer token on the Session Vault page and has no health banner. That is why a later fix has to add a banner without taking the oa-token branch's bookmarklet flow.

## Pricing

Live changes the money math; sidekick and oa-token do not.

- All-in and Max hammer include a purchase-card percent: `hammer × (1+BP%) × (1+card%) + inbound` (`acquisition.ts`, `maxBid.ts`, `new-floor.ts`). Defaults: card 3% (`DEAL_DEFAULT_PURCHASE_CARD_PCT`), target profit $50 in code. The Nov 15 run stored BP 15%, card 3%, target profit **$100**. Nov 17 used card 0% and target profit $50.
- The sheet channel picks the hero Max hammer and GO. Default sell channel is `gunbroker`, not `local`.
- Street "Cooling" no longer rewrites sold percentiles or Max Pay. It is advisory only (`evaluate-pipeline.ts`).
- An OA median that is many times the hammer forces NO-GO (`IDENTITY_RATIO_NOGO`).
- Walk-away is still `min(maxBid, dealerFloor)` with no conversion of dealer cost into a hammer, and it can fall back to the dealer floor when there is no Max hammer (`evaluate-row.ts`). That is the behavior the fix changes.

## Matching

`scorer.ts` grew typo tolerance, near-miss suggestions, and extra model attempts (Baby Browning, Buck Mark, XD, Savage 93). Those exist only on live.

Still the same failure modes as sidekick:

- `scoreModelName` returns **88** for any all-digit token that appears as a word, and for any catalog name containing `1911`, before other tokens are checked.
- Caliber alias groups still include bare `45`, `40`, and `357`, so `.45 ACP` can hit `.45-70` / `.45 Colt` and `.357 Mag` can hit `.357 SIG`.
- `resolveQueryAttempts` still pushes attempts with `caliber: undefined` and `condition: "any"`.
- `loadDepsAndResolve` returns the **first** attempt that clears the relaxed gate, not the highest score. That is how `BROWNING 1911-22 .22 LR` (51 sold) lost to `BROWNING 1911 .22 LR` (11 sold) when both scored as 1911.
- `loadLocalMarket` still fills a missing Used row from any condition, so Used can be priced on New solds.
- There is no minimum score before Max hammer. The local-cache selection stored on the bundle hardcodes `score: 100`.
- The batch UI truncates `matchNote` (`truncate` in `BatchSheetTable`, `RankedBuySheet`, `LotDetailPanel`), which is why "11 BROWNIN…" looked like a model name. The stored `source_status.gba` text is the full leaf.

## Ingest, CSV, and the empty Current column

- HiBid `extractLotBidMetaFromHtml` still slices **3500 characters after** `"lot_number":"<digits>"` and keeps the first bid fields in that window. Lot numbers are `\d+` only, so `20` and `20A` collide. Card HTML is scoped to the lot tile; the Apollo JSON is not.
- BidWrangler `itemToLot` sets `currentBid` to `closing_bid ?? high ?? ask_amount ?? minimum_bid_amount`. A 0-bid lot shows the opening ask as Current.
- `parseBatchSheet` splits on `\n` before quotes, so a newline inside a quoted title shifts columns. `splitLine` itself is quote-aware, but only per physical line.
- With no Category column, category is set to `"handgun"` **before** `parseTitleBlob`, and the later guard skips the title whenever the category is already handgun/rifle/shotgun. Auction CSV from `lotsToBatchCsv` has no Category column. `sanitizeBatchRowIdentity` re-parses only when the title looks dirty (`TRANS`, `CAL`, `SEMI`, `BOLT`, …), which is why Nov 17 URL titles that contain those words landed on rifle/shotgun and the Nov 15 paste (LAR-15, 94AE, 700) stayed handgun.
- Title hints still require a word boundary before `ar-15`, so `LAR-15` and `WW-15` miss. `pistol grip` matches `\bpistol\b` first. Rifle calibers and `94AE` / `Model 700` / gauges are not category hints. `saiga` is not in the brand list or the firearm-kind list, so a Saiga-12 lot is `unresolved` or non-firearm and never gets a `valuations` row.
- Export `src/lib/batch/csv.ts` (new on live) writes **Decision P25 immediately before Current hammer**. Phase 1: all 94 Nov 15 rows were scored with `targetAcquisitionCost` 0, and the $409 / $368.75 "Current" figures are those rows' P25 values. Paste-back makes it worse: `normHeader("Current hammer")` is `currenthammer`, which is **not** in the `currentBid` aliases, so a re-pasted export does not fill Current. `Decision P25` is not mapped to Current either; the misread is the adjacent blank column, plus the header the importer does not recognize.

## Queue and wholesale

- Queue behavior matches sidekick: one in-memory worker, 15s drip, 50/day. When the cap hits, remaining keys are shifted off the queue and remembered as a failed finish (`confidence: "low"`). The UI keeps saying Queued or collapses them to a vague Weak/Skipped. Nov 17: 267 queued, 48 looked up.
- Zero OA solds enqueue street asks and never produce a Max hammer. The note is "No OA solds — queued street-ask enrich" or "Street asks only", not a final "No OA Comps (No Max Bid)". Medium-confidence enrich stays "Weak" and is not re-evaluated.
- CSV import still uses `dealerPrice ?? salePrice ?? mapPrice ?? msrp` as the dealer cost (`csv/importer.ts`).
- `filterTextMatchesByPrice` discards distributor hits below 85% of the bid instead of keeping them with an Above Dealer Cost badge.
- `crossReferenceWholesale` returns an empty grid when nothing matches, but a thrown DB error escapes `runEvaluation` and becomes an error row. It does not by itself force NO-GO; `decideVerdictFull` only NO-GOs used deals when all-in is within $25 of a real dealer floor.

## What live already has that the fix must not regress

Purchase-card percent on all-in and Max hammer, per-sheet BP / card / target-profit fields (they exist, but card and BP sit below the paste box and the sheet header only shows them as read-only "BP" / "CC" chips), dual-exit GO, identity-ratio NO-GO, and the local OA cache path. The fix branch starts from this snapshot, not from sidekick.
