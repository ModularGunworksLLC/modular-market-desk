# Connect Outdoor Analytics

One-click refresh for the Outdoor Analytics (OA) session token Desk uses as a Bearer token against `api.gunbrokeranalytics.com`. The live Desk deploy is a separate step. This change does not deploy, merge, or touch the Lightsail host.

Michael approved the build on 2026-10-30. Shipping it to the live desk still waits for his separate yes, and the AWS Cloud SME does that deploy.

## Install the bookmarklet (once)

1. Open Desk → **Import**.
2. On the **Connect OA** card, drag the **Connect OA** link to the bookmarks bar.
3. Leave it there. Do not click it on the Import page. Clicking it on Desk only shows a reminder.

The bookmark is a `javascript:` link. Its only hard-coded destination is `DESK_PUBLIC_ORIGIN` (otherwise `PUBLIC_DESK_URL`, otherwise `https://desk.modulargunworks.com`). It will not post the token anywhere else. React 19 strips `javascript:` URLs during render, so the card writes the real href onto the link after it mounts. Wait for the page to finish loading before you drag it.

## Use it

1. Sign in to Desk in the browser you will use (the popup needs that session).
2. Sign in to [Outdoor Analytics](https://hub.outdooranalytics.com) through GunBroker.
3. Click the **Connect OA** bookmark while that OA tab is focused.
4. A Desk window opens at `/oa-connect`. It shows the expiry time and does **not** save until you click **Save**. Re-enter the Desk secret (or `OA_ADMIN_SECRET` if that is set). If the window shows the Desk login, sign in and click the bookmark again. The bookmark waits about two minutes.
5. The OA tab shows a green or red banner. The banner never includes the token.
6. Evaluate, Batch, and Import show the expiry banner at the top.

If OA has no session, the banner says to sign in to Outdoor Analytics first. Nothing is sent.

**Clear** and **Re-check token** are on the same Import card. Clear asks for the same confirmation secret and destroys the stored ciphertext (it is replaced, not left revoked-but-readable). Re-check is a POST and calls OA once. If `GBA_BEARER_TOKEN` is set, sync keeps using that env token after Clear, and the banner says so.

The old paste box on Import still works. Leave **Expires** blank and Desk reads `exp` from the JWT. Fill Expires only to override that time.

## What the banners mean

Times are America/Chicago. They do not follow the server's timezone.

| State | Look | Meaning |
| --- | --- | --- |
| connected | Neutral | `OA connected, expires at <Chicago time> (in X hours)` |
| expiring_soon | Amber | Less than `OA_EXPIRY_WARN_HOURS` left (default 2) |
| expired | Red | `exp` is in the past. Live calls are not attempted |
| unauthorized | Red | OA returned 401, or the last probe failed that way |
| not_connected | Red | Nothing saved, or the token was cleared |

Evaluate and Batch add a second line when live data cannot be used:

`Live OA data unavailable: token expired. Results below use the local catalog cache and may be stale.`

(`token missing` / `token unauthorized` use the same sentence.) Cached numbers still show when the local bank has them. They are labeled **cache**, not live. A per-lot **cache** flag is on the buy sheet. If there is no cache row, the result says so instead of pretending the figures are live.

The weekly sync does not swallow an auth failure. The Import weekly card shows an error, and a 401 sets the connection to `error` so the red banner stays up. Other ask sources may still update; the run is not marked ok.

## Security design

- **Popup + `postMessage`, not a cross-origin fetch.** Checked 2026-10-30: `https://hub.outdooranalytics.com/` returned no `Content-Security-Policy` header and no CSP meta tag, so a bookmarklet is not blocked by CSP today and a `fetch` would not be blocked by `connect-src` either. Fetch is still the wrong tool. The Desk cookie is `SameSite=Lax`, so a cross-origin POST from OA would not send it. Opening `/oa-connect` is a top-level navigation, so the cookie is sent. The token moves in a `postMessage` body to that window. The Desk page then POSTs it to `/api/vault/oa` on the Desk origin.
- The API rejects any `Origin` that is not the Desk origin, including `https://hub.outdooranalytics.com`. There is no CORS allow-list and no unauthenticated write.
- Missing `Origin` is accepted only when the bearer value itself matches `DESK_AUTH_SECRET` (constant-time). A cookie plus `Authorization: Bearer junk` and no Origin is rejected. The audit actor is the credential that matched, not the header prefix.
- Production refuses OA writes when `DESK_AUTH_SECRET` is unset (403), unless the configured Desk origin is loopback. Local dev (`NODE_ENV` not `production`) can still write without that secret.
- Every set/clear also re-prompts. By default that is `DESK_AUTH_SECRET` again. If `OA_ADMIN_SECRET` is set, that value is required instead, so a Desk session alone cannot write. Web PM is confirming who holds the secret; switch by setting or unsetting `OA_ADMIN_SECRET`. No code change.
- The popup accepts a `postMessage` only from `window.opener` and only from an allowed origin. It does not save until **Save** is clicked.
- `/import` and `/oa-connect` send `Content-Security-Policy: frame-ancestors 'none'` and `X-Frame-Options: DENY`. Referrer-Policy is `no-referrer` on every page.
- The token stays AES-256-GCM with `SESSION_VAULT_KEY`. The ciphertext format is unchanged. Request bodies are capped at 8 KB and must be `application/json`.
- `exp` is base64url-decoded. The signature is not verified. An `exp` more than 30 days out is stored but the banner marks it suspicious.
- `audit_log` records actor, time, action (`oa_token_set`, `oa_token_clear`, `oa_token_failed_attempt`), a validated `X-Real-IP`, and a truncated user agent. The token is not stored. Only failed-attempt rows are capped (newest 500). Set and clear rows are never pruned.
- Failed attempts that reach the route (bad origin, bad confirm, malformed token) are audited. Anonymous requests blocked by middleware never reach the route, so they are not audited. That avoids filling the log from the public internet.
- The mock page is not a `public/` file. `/oa-mock.html` is a route that returns 404 in production, including percent-encoded paths such as `/oa%2Dmock.html`.

Actor is `desk-session`, `desk-bearer`, or `desk-open` (local dev with no secret). There is still no per-person id. IP and user agent are the extra "who" fields.

## Session storage key

Default key: `gb_session_token`.

Verified 2026-10-30 from the public bundle `https://hub.outdooranalytics.com/main-GT43ZVAN.js`, which calls `sessionStorage.getItem("gb_session_token")` as the signed-in check. This build did **not** sign in, so it did not watch OA write the value. Override with `OA_SESSION_STORAGE_KEY` if OA renames it, then drag the bookmarklet again.

## Config

| Variable | Purpose | Default |
| --- | --- | --- |
| `DESK_PUBLIC_ORIGIN` | Origin baked into the bookmarklet | `PUBLIC_DESK_URL`, else `https://desk.modulargunworks.com` |
| `OA_ALLOWED_ORIGINS` | Who may `postMessage` into `/oa-connect` | `https://hub.outdooranalytics.com` |
| `OA_SESSION_STORAGE_KEY` | Key read on the OA page | `gb_session_token` |
| `OA_EXPIRY_WARN_HOURS` | Amber banner threshold | `2` |
| `SESSION_VAULT_KEY` | Existing AES-256-GCM key | required |
| `DESK_AUTH_SECRET` | Desk gate. Also the default re-prompt for OA set/clear | empty disables the gate for the rest of Desk; OA writes still refuse in production |
| `OA_ADMIN_SECRET` | If set, set/clear require this instead of re-entering the Desk secret | unset (re-prompt `DESK_AUTH_SECRET`) |
| `GBA_BEARER_TOKEN` | Optional sync override. Clear does not remove it | unset |

Loopback origins (`http://127.0.0.1`, `http://localhost`) may use http so local dev works. Any other http origin is refused. When the Desk origin is loopback, that origin may also `postMessage` so the mock page can run. Production does not allow that.

## Test locally with a fake token

```bash
cp .env.example .env
# set SESSION_VAULT_KEY (32 bytes, base64) and DATABASE_URL
# DESK_PUBLIC_ORIGIN must be the origin you type in the browser
# DESK_PUBLIC_ORIGIN=http://127.0.0.1:3000
npm run db:init
npm run dev
```

1. Open `http://127.0.0.1:3000/import` (sign in first if `DESK_AUTH_SECRET` is set).
2. Open `http://127.0.0.1:3000/oa-mock.html`.
3. Click **Store fake token (future exp)** or **already expired**. The page writes `sessionStorage["gb_session_token"]` and does not print the token.
4. Click the **Connect OA** link on the mock page (loaded from Desk), or the bookmark you dragged.
5. The Desk popup saves it. Import / Evaluate / Batch show the Chicago expiry banner.
6. Store an already-expired fake token and connect again. The banner goes red. Evaluate still returns cached comps when they exist, labeled cache.

The mock page is not Outdoor Analytics. It only proves the handoff. Do not put a real OA token in it unless you are on a machine you trust. Automated tests use fake JWTs and do not call OA.

## Staging, then a real token

1. Deploy this branch only to a staging copy of Desk (not production).
2. Set `DESK_PUBLIC_ORIGIN` to that staging origin and drag a new bookmarklet. The old bookmark still points at whatever origin it was built with.
3. Repeat the mock-page test against staging.
4. Sign in to real OA and click the bookmark once. Confirm the banner time matches the session you expect, in Chicago time.
5. Run one Evaluate that needs a live pull, or **Re-check token**, and confirm the banner stays connected.
6. Do not paste the token into tickets, logs, or chat.

## Rollout checklist

- [ ] Michael has said yes to the live deploy (the 2026-10-30 approval was for this build, not for production).
- [ ] AWS Cloud SME deploys. This repo change does not deploy itself.
- [ ] `SESSION_VAULT_KEY` on the server is the same key already used for the vault. Do not rotate it as part of this change.
- [ ] `DESK_PUBLIC_ORIGIN` on the server is `https://desk.modulargunworks.com` (or the real public origin).
- [ ] After deploy, Michael drags a **new** bookmarklet from production Import. A bookmark built on localhost will refuse to talk to production, and the reverse.
- [ ] He connects once from a signed-in OA tab and checks the Chicago expiry banner.
- [ ] Weekly sync is left to fail visibly if the token is rejected. Do not hide that error.
- [ ] `/api/trade-in/estimate` is unchanged and stays public.

## Security review fixes

Review of `20cfdf5` (GO after must-fixes). Mapping:

| Finding | Status |
| --- | --- |
| M1 Bearer prefix / fail-open writes | Fixed. Bearer value is compared to the secret. Actor comes from the match. Production OA writes fail closed when the secret is unset. |
| M2 Silent save / no `event.source` check | Fixed. Message must come from `window.opener`. Save is a click after the Chicago expiry is shown. |
| M3 No admin identity | Fixed as a config choice. Default re-prompt of `DESK_AUTH_SECRET`. `OA_ADMIN_SECRET` switches the re-prompt. Audit stores `X-Real-IP` and a truncated user agent, never the token. |
| M4 Missing regression tests | Fixed. Cookie + junk bearer + no Origin, production with no secret, forged `event.source`, and no save before the confirm phase. Redaction tests kept. |
| N1 Body cap | Fixed. 8 KB JSON only. |
| N2 Far `exp` | Fixed. Flagged on the banner when more than 30 days out. It does not authorize anything. |
| N3 Probe on GET | Fixed. Probe is `POST /api/vault/status` with the origin gate and a per-minute limit. |
| N4 Framing headers | Fixed, then widened in the re-review. `frame-ancestors 'none'` and `X-Frame-Options: DENY` apply to every path. Global `Referrer-Policy: no-referrer`. |
| N5 Mock page in production | Fixed in the re-review. A production build 404s `/oa-mock.html` based on `NODE_ENV`, not the request host. `OA_MOCK_PAGE=1` is the only override. |
| N6 Bookmarklet result source | Fixed. Result listener requires `ev.source === popup`. |
| N7 `GBA_BEARER_TOKEN` | Fixed. Banner states that sync keeps using the env token after Clear. |
| N8 Failed-attempt audit claim | Fixed in this doc. Middleware 401s are not audited. Route-level failures are. Noisy failed-attempt rows are capped. Set and clear rows are never pruned. |
| N9 `//evil` login redirect | Fixed, then tightened in the re-review. Control characters are rejected, and the path is resolved with `new URL` and must stay on the same origin. |
| N10 Drizzle journal gap | Not closed by inserting `0003`/`0004`. Those files use `ALTER TABLE ADD COLUMN`, which is not idempotent, and live databases already have the columns from `ensure*`. `drizzle-kit migrate` applies journal idx 0–3 (`0000`, `0001`, `0002`, `0005_oa_audit_log`) on a fresh database. `ensureOaVaultTables()` still creates `audit_log` at runtime. |
| N11 Repo visibility | Not in this PR. Making the GitHub repo private is a settings change, not a code change. |

## Re-review fixes

Re-review of `71fd08e` (clear after small fixes):

| Finding | Status |
| --- | --- |
| NEW-1 Audit wipe via rate-limit rows | Fixed. A throttled window writes one summary row, not one per request. Prune deletes only `oa_token_failed_attempt` rows and orders them by an AUTOINCREMENT `seq`. `oa_token_set` and `oa_token_clear` are kept. |
| NEW-2 `/%09/evil` open redirect | Fixed. `safeInternalPath` rejects `\x00-\x1f` and `\x7f`, then resolves with `new URL(next, origin)` and requires the same origin and a single leading slash. |
| NEW-3 Mock page served by `next start` | Fixed. The gate is `NODE_ENV !== "production"` (or `OA_MOCK_PAGE=1`). It does not look at `Host`. A production build returns 404 for `/oa-mock.html`. |
| NEW-4 Trusted `X-Real-IP` | Fixed. The value must be an IPv4 or IPv6 address or it is stored as unknown. Control characters are stripped from the IP and the user agent. Docker publishes `127.0.0.1:3010` only. The Apache example sets `RequestHeader set X-Real-IP` from the real client address and says Apache must overwrite any client-supplied value. |
| HMAC compare | Fixed. `secretsMatch` compares fixed-length HMAC digests, including the login check. |
| Strict Content-Type and body cap | Fixed. The media type must be exactly `application/json`. The body is read through a stream that stops at 8 KB. |
| Bookmarklet resend during save | Fixed. Messages are ignored once Save has started. |
| Site-wide frame headers | Fixed. `frame-ancestors 'none'` and `X-Frame-Options: DENY` are on `/:path*`. |
| `DESK_PUBLIC_ORIGIN` example | Fixed. Marked dev-only, with a warning not to copy a loopback origin into production without a desk secret. |
| `OaConnectClient` component test | Fixed. Covers a forged source, no save before the click, the Chicago expiry, and a resend during save. |
| Login rate limit | Not in this change. `/api/auth/login` had no limit before this PR. |

## Known limits

- A revoked token whose `exp` is still in the future stays "connected" until something actually calls OA. Batch does that once at the start of a sheet. Evaluate uses the local cache first and does not call OA when that cache already has sold comps, so it will not discover a new 401 by itself. Use **Re-check token**, Batch, or the weekly sync to flip the banner to unauthorized.
- The bookmarklet was checked against the public OA page (no CSP, and `sessionStorage.getItem("gb_session_token")` in the bundle). It was not clicked on a signed-in OA session.
- Firefox can block bookmarklets when a page later adds a strict `script-src`. Chrome currently runs them. If OA adds a CSP that blocks the bookmarklet, the fallback is to paste the token on Import.
- Desk auth is still one shared secret. The audit actor is the auth method plus `X-Real-IP` and a truncated user agent, not a person's name. Set `OA_ADMIN_SECRET` if a Desk session must not be enough to write the vault.
- This branch is still based on `feature/sidekick`. AWS found the live Desk is newer (62 files differ, 37 live-only). Rebase onto an exported copy of that tree before any deploy. Do not deploy from this branch as-is.

## Automated tests

```bash
npm test
npm run lint
npm run typecheck
```

Unit tests cover JWT `exp` (including malformed tokens), state transitions, Chicago formatting, bookmarklet shape, redaction, auth rejection (anonymous, evil origin, and the OA origin), audit rows without the token, and the Evaluate cache labeling sentence. They do not call Outdoor Analytics.
