"""Save Playwright sessions for public market sites (GunBroker, Gun.deals)."""

from __future__ import annotations

import argparse
import sys
import time

from mmd_engine.age_gate import goto_dealer_page
from mmd_engine.browser import browser_page, dismiss_age_gate
from mmd_engine.config import session_path
from mmd_engine.credentials import get_site

MARKET_SITES = {
    "gunbroker": {
        "label": "GunBroker",
        "url": "https://www.gunbroker.com/",
    },
    "gundeals": {
        "label": "Gun.deals",
        "url": "https://www.gun.deals/",
    },
}


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Save market site browser session (helps pass captcha/Cloudflare)"
    )
    parser.add_argument(
        "site",
        nargs="?",
        choices=sorted(MARKET_SITES.keys()),
        help="gunbroker or gundeals",
    )
    parser.add_argument("--list", action="store_true", help="List market site ids")
    parser.add_argument(
        "--wait-seconds",
        type=int,
        default=0,
        metavar="N",
        help="Wait N seconds in the browser, then save (no Enter needed)",
    )
    parser.add_argument(
        "--auto-login",
        action="store_true",
        help="Use sites.local.yaml / .env credentials when available",
    )
    args = parser.parse_args()

    if args.list or not args.site:
        print("Market sites:")
        for sid, meta in MARKET_SITES.items():
            print(f"  {sid} — {meta['label']}")
        if not args.site:
            sys.exit(0)

    meta = MARKET_SITES[args.site]
    out = session_path(args.site)
    site_cfg = None
    try:
        site_cfg = get_site(args.site)
    except KeyError:
        pass

    use_auto = args.auto_login or (
        site_cfg is not None and site_cfg.is_configured() and site_cfg.login_url
    )

    if use_auto and site_cfg and site_cfg.login_url:
        from mmd_engine.cli.auth import _try_auto_login

        print(f"Auto-login to {meta['label']} using saved credentials…")
        print(f"Session file: {out}")
        extra = (site_cfg.age_gate_yes,) if site_cfg.age_gate_yes else ()
        with browser_page(headless=True) as page:
            _try_auto_login(page, site_cfg)
            dismiss_age_gate(page, extra_css=extra)
            page.wait_for_timeout(5_000)
            page.context.storage_state(path=str(out))
    else:
        print(f"Opening {meta['label']} in a browser window.")
        if args.wait_seconds > 0:
            print(f"Log in or pass any captcha/age gate. Saving in {args.wait_seconds}s…")
        else:
            print("Log in or pass any captcha/age gate, then press Enter here to save the session.")
        print(f"Session file: {out}")

        with browser_page(headless=False) as page:
            page.goto(meta["url"], wait_until="domcontentloaded", timeout=90_000)
            dismiss_age_gate(page)
            if args.wait_seconds > 0:
                time.sleep(args.wait_seconds)
            else:
                input("Press Enter when finished… ")
            page.context.storage_state(path=str(out))

    print(f"Saved session to {out}")


if __name__ == "__main__":
    main()
