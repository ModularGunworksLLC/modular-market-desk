"""Save Playwright storage state for distributor logins (MFA-friendly headed mode)."""

from __future__ import annotations

import argparse
import sys

from mmd_engine.age_gate import dismiss_age_gate, goto_dealer_page
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
        "--headless",
        action="store_true",
        help="No browser window (Lightsail / auto-login only)",
    )
    parser.add_argument(
        "--wait-seconds",
        type=int,
        default=0,
        metavar="N",
        help="Headless: wait N seconds after login before saving",
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
    print("Age gates: we auto-click Yes/Enter when possible; click through manually if needed.")
    print("Complete MFA/CAPTCHA if prompted, then press Enter here.")
    print(f"Opening {site.login_url} …")

    extra = (site.age_gate_yes,) if site.age_gate_yes else ()
    wait_ms = ((args.wait_seconds if args.wait_seconds > 0 else 5) * 1000) if args.headless else 0
    try:
        with browser_page(
            headless=args.headless,
            storage_state=dest if dest.exists() else None,
        ) as page:
            if args.headless and site.is_configured():
                from mmd_engine.service.session_auth import try_auto_login

                try_auto_login(page, site)
                dismiss_age_gate(page, extra_css=extra)
                page.wait_for_timeout(wait_ms)
            else:
                if site.is_configured() and not dest.exists():
                    from mmd_engine.service.session_auth import try_auto_login

                    try_auto_login(page, site)
                else:
                    goto_dealer_page(page, site.login_url, timeout=60_000, extra_css=extra)
                dismiss_age_gate(page, extra_css=extra)
                input("Press Enter after you are fully logged in… ")
            page.context.storage_state(path=str(dest))
    except Exception as exc:
        print(f"Auth failed: {exc}", file=sys.stderr)
        sys.exit(1)

    print(f"Saved session to {dest}")


if __name__ == "__main__":
    main()
