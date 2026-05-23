"""Refresh Playwright sessions for all enabled dealers (headless, server-friendly)."""

from __future__ import annotations

import argparse
import sys

from mmd_engine.age_gate import dismiss_age_gate
from mmd_engine.browser import browser_page
from mmd_engine.cli.auth import _try_auto_login
from mmd_engine.config import SESSIONS_DIR, session_path
from mmd_engine.credentials import list_sites

_MARKET_SITES = frozenset({"gunbroker", "gundeals"})


def _refresh_dealer(site, *, wait_ms: int) -> bool:
    dest = session_path(site.id)
    SESSIONS_DIR.mkdir(parents=True, exist_ok=True)
    if not site.is_configured():
        print(f"  skip {site.id}: not configured")
        return False
    if not site.login_url:
        print(f"  skip {site.id}: no login URL")
        return False
    extra = (site.age_gate_yes,) if site.age_gate_yes else ()
    try:
        with browser_page(headless=True, storage_state=dest if dest.exists() else None) as page:
            _try_auto_login(page, site)
            dismiss_age_gate(page, extra_css=extra)
            page.wait_for_timeout(wait_ms)
            page.context.storage_state(path=str(dest))
        size = dest.stat().st_size if dest.exists() else 0
        print(f"  ok {site.id}: {size} bytes")
        return size > 500
    except Exception as exc:
        print(f"  fail {site.id}: {exc}", file=sys.stderr)
        return False


def _refresh_market(site_id: str) -> bool:
    import subprocess

    out = session_path(site_id)
    r = subprocess.run(
        [sys.executable, "-m", "mmd_engine.cli.market_auth", site_id, "--auto-login"],
        check=False,
    )
    size = out.stat().st_size if out.exists() else 0
    if r.returncode == 0 and size > 500:
        print(f"  ok {site_id}: {size} bytes")
        return True
    print(f"  fail {site_id}: exit {r.returncode}, {size} bytes", file=sys.stderr)
    return False


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Refresh all enabled dealer/market sessions (for Lightsail cron)"
    )
    parser.add_argument(
        "--wait-ms",
        type=int,
        default=5_000,
        help="Wait after login before saving (default 5000)",
    )
    parser.add_argument(
        "--dealers-only",
        action="store_true",
        help="Skip gunbroker/gundeals",
    )
    parser.add_argument(
        "--market-only",
        action="store_true",
        help="Only gunbroker/gundeals",
    )
    parser.add_argument(
        "sites",
        nargs="*",
        help="Optional site ids (default: all enabled configured)",
    )
    args = parser.parse_args()

    ok = 0
    fail = 0

    if not args.market_only:
        targets = list_sites(include_excluded=False)
        if args.sites:
            from mmd_engine.credentials import get_site

            targets = [get_site(sid) for sid in args.sites if sid not in _MARKET_SITES]
        else:
            targets = [
                s
                for s in targets
                if s.enabled
                and s.is_configured()
                and s.login_url
                and not s.excluded
                and s.id not in _MARKET_SITES
            ]
        print(f"Dealers ({len(targets)}):")
        for site in targets:
            if _refresh_dealer(site, wait_ms=args.wait_ms):
                ok += 1
            else:
                fail += 1

    if not args.dealers_only:
        market_ids = ["gunbroker", "gundeals"]
        if args.sites:
            market_ids = [s for s in args.sites if s in _MARKET_SITES]
        print(f"Market ({len(market_ids)}):")
        for sid in market_ids:
            if _refresh_market(sid):
                ok += 1
            else:
                fail += 1

    print(f"Done: {ok} ok, {fail} failed/skipped")
    sys.exit(0 if fail == 0 else 1)


if __name__ == "__main__":
    main()
