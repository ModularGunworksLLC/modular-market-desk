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
    print("Age gates: we auto-click Yes/Enter when possible; click through manually if needed.")
    print("Complete MFA/CAPTCHA if prompted, then press Enter here.")
    print(f"Opening {site.login_url} …")

    extra = (site.age_gate_yes,) if site.age_gate_yes else ()
    try:
        with browser_page(headless=not args.headed, storage_state=dest if dest.exists() else None) as page:
            if site.is_configured() and not dest.exists():
                _try_auto_login(page, site)
            else:
                goto_dealer_page(page, site.login_url, timeout=60_000, extra_css=extra)
            dismiss_age_gate(page, extra_css=extra)
            input("Press Enter after you are fully logged in… ")
            page.context.storage_state(path=str(dest))
    except Exception as exc:
        print(f"Auth failed: {exc}", file=sys.stderr)
        sys.exit(1)

    print(f"Saved session to {dest}")


def _try_auto_login(page, site) -> None:
    user = site.resolved_username()
    password = site.resolved_password()
    extra = (site.age_gate_yes,) if site.age_gate_yes else ()
    if not user or not password:
        goto_dealer_page(page, site.login_url, timeout=60_000, extra_css=extra)
        return
    goto_dealer_page(page, site.login_url, timeout=90_000, extra_css=extra)
    page.wait_for_timeout(2_000)
    if site.id == "zanders":
        print(
            "Zanders uses Cloudflare — complete the checkbox/captcha if shown, "
            "then sign in (auto-fill may work after the challenge)."
        )
    try:
        if site.id == "zanders":
            page.wait_for_selector(
                "#email, input[name='login[username]']",
                timeout=120_000,
            )
            page.fill(
                "#email, input[name='login[username]'], input[type='email']",
                user,
                timeout=10_000,
            )
            page.fill(
                "#pass, input[name='login[password]'], input[type='password']",
                password,
                timeout=10_000,
            )
            page.click(
                "#send2, button.action.login, button[type='submit'], input[type='submit']",
                timeout=10_000,
            )
        else:
            page.fill(
                'input[type="email"], input[name="email"], input[name="username"]',
                user,
                timeout=10_000,
            )
            page.fill('input[type="password"]', password, timeout=10_000)
            page.click('button[type="submit"], input[type="submit"]', timeout=10_000)
        page.wait_for_timeout(4_000)
    except Exception:
        print("Auto-login did not complete — finish login manually in the browser.")


if __name__ == "__main__":
    main()
