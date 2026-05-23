"""Save Playwright sessions for public market sites (GunBroker, Gun.deals)."""

from __future__ import annotations

import argparse
import sys

from mmd_engine.config import session_path
from mmd_engine.credentials import get_site
from mmd_engine.service.session_auth import (
    MARKET_SITE_URLS,
    refresh_market_session_auto,
    refresh_market_session_headed,
)

MARKET_SITES = MARKET_SITE_URLS


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
        print(f"Auto-login to {meta['label']} using saved credentials…")
        print(f"Session file: {out}")
        refresh_market_session_auto(args.site, wait_seconds=5)
    elif args.wait_seconds:
        print(f"Opening {meta['label']} in a browser window.")
        print(f"Log in or pass any captcha/age gate. Saving in {args.wait_seconds}s…")
        print(f"Session file: {out}")
        refresh_market_session_headed(args.site, wait_seconds=args.wait_seconds)
    else:
        print(
            f"No credentials for {meta['label']}; use sites.local.yaml, --auto-login, or --wait-seconds.",
            file=sys.stderr,
        )
        sys.exit(1)

    print(f"Saved session to {out}")


if __name__ == "__main__":
    main()
