"""Save Playwright storage state for distributor logins (MFA-friendly headed mode)."""

from __future__ import annotations

import argparse
import sys

from mmd_engine.browser import browser_page
from mmd_engine.config import SESSIONS_DIR, session_path

DEALERS = {
    "lipseys": {
        "login_url": "https://www.lipseys.com/login",
        "hint": "Log in to Lipsey's, complete MFA if prompted, then press Enter in this terminal.",
    },
    "zanders": {
        "login_url": "https://www.zanders.com/login.asp",
        "hint": "Log in to Zanders, complete MFA if prompted, then press Enter in this terminal.",
    },
}


def main() -> None:
    parser = argparse.ArgumentParser(description="Save dealer login session for Modular Market Desk")
    parser.add_argument(
        "dealer",
        choices=sorted(DEALERS.keys()),
        help="Distributor to authenticate",
    )
    parser.add_argument(
        "--headed",
        action="store_true",
        default=True,
        help="Show browser window (default: on)",
    )
    args = parser.parse_args()

    info = DEALERS[args.dealer]
    dest = session_path(args.dealer)
    SESSIONS_DIR.mkdir(parents=True, exist_ok=True)

    print(info["hint"])
    print(f"Opening {info['login_url']} …")

    try:
        with browser_page(headless=not args.headed) as page:
            page.goto(info["login_url"], wait_until="domcontentloaded", timeout=60_000)
            input("Press Enter after you are fully logged in… ")
            page.context.storage_state(path=str(dest))
    except Exception as exc:
        print(f"Auth failed: {exc}", file=sys.stderr)
        sys.exit(1)

    print(f"Saved session to {dest}")


if __name__ == "__main__":
    main()
