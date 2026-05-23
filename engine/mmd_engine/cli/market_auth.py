"""Save Playwright sessions for public market sites (GunBroker, Gun.deals)."""

from __future__ import annotations

import argparse
import sys
import time

from mmd_engine.browser import browser_page, dismiss_age_gate
from mmd_engine.config import session_path

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
    args = parser.parse_args()

    if args.list or not args.site:
        print("Market sites:")
        for sid, meta in MARKET_SITES.items():
            print(f"  {sid} — {meta['label']}")
        if not args.site:
            sys.exit(0)

    meta = MARKET_SITES[args.site]
    out = session_path(args.site)
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
