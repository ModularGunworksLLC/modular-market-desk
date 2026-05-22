"""Save Playwright storage state for distributor logins (MFA-friendly headed mode)."""

from __future__ import annotations

import argparse
import sys

from mmd_engine.browser import browser_page
from mmd_engine.config import SESSIONS_DIR, session_path
from mmd_engine.credentials import get_site, list_sites


def main() -> None:
    site_ids = [s.id for s in list_sites(include_excluded=False) if not s.excluded]
    parser = argparse.ArgumentParser(
        description="Save dealer login session (for MFA / CAPTCHA sites)"
    )
    parser.add_argument(
        "site",
        nargs="?",
        choices=site_ids,
        help="Site id from sites.local.yaml (e.g. lipseys, zanders)",
    )
    parser.add_argument(
        "--list",
        action="store_true",
        help="List available site ids",
    )
    parser.add_argument(
        "--headed",
        action="store_true",
        default=True,
        help="Show browser window (default: on)",
    )
    args = parser.parse_args()

    if args.list or not args.site:
        print("Sites you can authenticate:")
        for s in list_sites():
            print(f"  {s.id:<16} {s.label}")
        if not args.site:
            print("\nUsage: python -m mmd_engine.cli.auth lipseys")
        return

    site = get_site(args.site)
    if not site.login_url:
        print(f"No login URL for {args.site}", file=sys.stderr)
        sys.exit(1)

    dest = session_path(site.id)
    SESSIONS_DIR.mkdir(parents=True, exist_ok=True)

    print(f"{site.label}")
    if site.is_configured():
        print("Credentials found — you can log in manually or let auto-login use your saved password.")
    else:
        print("No password in sites.local.yaml / .env — log in manually in the browser.")
    print("Complete MFA/CAPTCHA if prompted, then press Enter here.")
    print(f"Opening {site.login_url} …")

    try:
        with browser_page(headless=not args.headed, storage_state=dest if dest.exists() else None) as page:
            if site.is_configured() and not dest.exists():
                _try_auto_login(page, site)
            else:
                page.goto(site.login_url, wait_until="domcontentloaded", timeout=60_000)
            input("Press Enter after you are fully logged in… ")
            page.context.storage_state(path=str(dest))
    except Exception as exc:
        print(f"Auth failed: {exc}", file=sys.stderr)
        sys.exit(1)

    print(f"Saved session to {dest}")


def _try_auto_login(page, site) -> None:
    user = site.resolved_username()
    password = site.resolved_password()
    if not user or not password:
        page.goto(site.login_url, wait_until="domcontentloaded", timeout=60_000)
        return
    page.goto(site.login_url, wait_until="domcontentloaded", timeout=60_000)
    try:
        page.fill('input[type="email"], input[name="email"], input[name="username"]', user, timeout=5_000)
        page.fill('input[type="password"]', password, timeout=5_000)
        page.click('button[type="submit"], input[type="submit"]', timeout=5_000)
        page.wait_for_timeout(4_000)
    except Exception:
        print("Auto-login did not complete — finish login manually in the browser.")


if __name__ == "__main__":
    main()
