# Pearce buy sheet vs synced OA DB

Generated: 2026-07-16T01:31:50.059Z
DB: `file:./data/desk-lightsail-oa.db`

## Tallies

- **MATCH_CLOSE**: 116
- **RESOLVE_FAIL**: 93
- **SHEET_NO_COMPS_DB_HAS**: 5
- **MATCH_DRIFT**: 3
- **SHEET_HAD_COMPS_DB_MISS**: 1

## What to troubleshoot

| Bucket | Count | Meaning |
|---|---:|---|
| MATCH_CLOSE | 116 | Live sheet ≈ DB — good |
| MATCH_DRIFT | 3 | Same-ish match but P25 ≥15% off — verify variant/caliber |
| SHEET_NO_COMPS_DB_HAS | 5 | Was RESEARCH; DB now has solds — re-price |
| SHEET_HAD_COMPS_DB_MISS / RESOLVE_FAIL | 94 | Parser/alias can't hit DB leaf (or wrong leaf) |
| BOTH_NO_COMPS | 0 | Still no comps after full sync — OA gap or ID fail |

## Top P25 drift (sheet → DB)

| Lot | ΔP25% | Sheet P25 | DB P25 | Sheet sold | DB sold | DB match |
|---|---:|---:|---:|---:|---:|---|
| 118 | -39.9% | 114 | 68.5 | 80 | 167 | RAVEN ARMS MP-25 .25 ACP (6.5MM) (USED, score 83) |
| 85 | -28% | 112.5 | 81 | 23 | 43 | MOSSBERG 702 PLINKSTER .22 LR (USED, score 95) |
| 26 | 15.9% | 517 | 599 | 71 | 82 | CZ-USA CZ 75 9MM LUGER (USED, score 95) |

## Rescue candidates (sheet no comps → DB has solds)

| Lot | DB sold | DB P25 | DB maxBid* | Match | Title |
|---|---:|---:|---:|---|---|
| 25 | 26 | 171.25 | 86.94 | CHIAPPA 1911-22 .22 LR (USED, score 85) | Chiappa Empire 1911 Nebula .45 ACP |
| 30 | 14 | 431.25 | 293.79 | ARMSCOR/RIA 1911 10MM (USED, score 95) | Rock Island Armory M1911 A1 FS 10mm |
| 31 | 72 | 290 | 181.17 | ARMSCOR/RIA 1911 .45 ACP (USED, score 95) | Rock Island Armory M1911 A1 CS .45 ACP |
| 52 | 64 | 121.5 | 47.45 | TAURUS G2S 9MM LUGER (USED, score 65) | Taurus G2S .40 S&W |
| 198 | 449 | 115 | 42.3 | TAURUS G2C 9MM LUGER (USED, score 65) | Taurus G2C .40 S&W |

\* DB maxBid = Desk math on DB P25 with Pearce 18.45% all-in + $50 target.

## Resolve / miss problems (sample)

- **Lot 12**: Title parse/resolve failed and sheet had no comps
  - Title: Arthemis Silah Sanayi Side by Side Double Barrel Engraved & Hand Carved Stock 12ga
  - Sheet: sold=0 p25=null · no catalog match for this manufacturer/model
  - DB: no resolve
- **Lot 13**: Title parse/resolve failed and sheet had no comps
  - Title: Leopar Sil San 870 Semi Automatic Engraved Turkish Walnut 12ga
  - Sheet: sold=0 p25=null · no catalog match for this manufacturer/model
  - DB: no resolve
- **Lot 14**: Title parse/resolve failed and sheet had no comps
  - Title: Alpha Foxtrot Romulus 9mm
  - Sheet: sold=0 p25=null · no catalog match for this manufacturer/model
  - DB: no resolve
- **Lot 20**: Title parse/resolve failed and sheet had no comps
  - Title: American Tactical FX45 GI .45 ACP
  - Sheet: sold=0 p25=null · no catalog match for this manufacturer/model
  - DB: no resolve
- **Lot 22**: Title parse/resolve failed and sheet had no comps
  - Title: Bond Arms Stinger Honey B 9mm
  - Sheet: sold=0 p25=null · no catalog match for this manufacturer/model
  - DB: no resolve
- **Lot 27**: Title parse/resolve failed and sheet had no comps
  - Title: Double Tap Defense Pocket 9mm
  - Sheet: sold=0 p25=null · no catalog match for this manufacturer/model
  - DB: no resolve
- **Lot 32**: Title parse/resolve failed and sheet had no comps
  - Title: Rossi RS22P .22 LR
  - Sheet: sold=0 p25=null · no catalog match for this manufacturer/model
  - DB: no resolve
- **Lot 38**: Title parse/resolve failed and sheet had no comps
  - Title: Sig Sauer P938 9mm
  - Sheet: sold=0 p25=null · no catalog match for this manufacturer/model
  - DB: no resolve
- **Lot 39**: Title parse/resolve failed and sheet had no comps
  - Title: Sig Sauer P365-9 BXR3 9mm
  - Sheet: sold=0 p25=null · no catalog match for this manufacturer/model
  - DB: no resolve
- **Lot 40**: Title parse/resolve failed and sheet had no comps
  - Title: Sig Sauer P320 9mm
  - Sheet: sold=0 p25=null · no catalog match for this manufacturer/model
  - DB: no resolve
- **Lot 41**: Title parse/resolve failed and sheet had no comps
  - Title: Sig Sauer P365 9mm
  - Sheet: sold=0 p25=null · no catalog match for this manufacturer/model
  - DB: no resolve
- **Lot 42**: Title parse/resolve failed and sheet had no comps
  - Title: Sig Sauer P938 9mm
  - Sheet: sold=0 p25=null · no catalog match for this manufacturer/model
  - DB: no resolve
- **Lot 43**: Title parse/resolve failed and sheet had no comps
  - Title: Sig Sauer P226 .40 S&W
  - Sheet: sold=0 p25=null · no catalog match for this manufacturer/model
  - DB: no resolve
- **Lot 44**: Title parse/resolve failed and sheet had no comps
  - Title: Sig Sauer P238 Nightmare .380 ACP
  - Sheet: sold=0 p25=null · no catalog match for this manufacturer/model
  - DB: no resolve
- **Lot 45**: Title parse/resolve failed and sheet had no comps
  - Title: Sig Sauer P365 9mm
  - Sheet: sold=0 p25=null · no catalog match for this manufacturer/model
  - DB: no resolve

## Still orphans (both no comps) — sample


Full JSON: `tmp-pearce-oa-db-compare.json`