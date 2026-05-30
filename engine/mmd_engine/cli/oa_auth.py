"""Capture Outdoor Analytics bearer token from the GB Analytics hub."""

from __future__ import annotations

import argparse
import shutil
import sys
import time
from pathlib import Path

from mmd_engine.browser import browser_page
from mmd_engine.chrome_profile import copy_profile_to_temp, list_browser_profiles
from mmd_engine.oa_session import save_bearer_token

HUB_PRICING_URL = "https://hub.outdooranalytics.com/pricing"
SESSION_STORAGE_KEY = "gb_session_token"


def print_manual_instructions() -> None:
    print(
        """
Cloudflare often blocks Playwright. Use your normal browser instead:

1. Close this script's browser window if it is still open.
2. In regular Google Chrome (not automated), open:
   https://hub.outdooranalytics.com/pricing
3. Pass Cloudflare and sign in with GunBroker if asked.
4. Press F12 -> Application -> Storage -> Session storage
   -> https://hub.outdooranalytics.com -> gb_session_token
5. Double-click the Value column and copy the long token string.

   Or on the pricing page, open Console (F12) and run:
   copy(sessionStorage.getItem('gb_session_token'))

6. Save it:
   cd engine
   python -m mmd_engine.cli.oa_auth --token "PASTE_TOKEN_HERE"

7. Upload:
   .\\scripts\\sync-oa-session.ps1 -UploadOnly
   (or scp data\\sessions\\outdoor_analytics.json to the server)
""".strip(),
        flush=True,
    )


def _read_token_from_page(page) -> str | None:
    token = page.evaluate(
        f"() => window.sessionStorage.getItem('{SESSION_STORAGE_KEY}')"
    )
    if isinstance(token, str) and token.strip():
        return token.strip()
    return None


def _poll_token(page, *, deadline: float) -> str | None:
    while time.time() < deadline:
        token = _read_token_from_page(page)
        if token:
            return token
        page.wait_for_timeout(2_000)
    return None


def capture_token_playwright(*, wait_seconds: int = 180) -> str:
    deadline = time.time() + max(30, wait_seconds)
    with browser_page(headless=False) as page:
        page.goto(HUB_PRICING_URL, wait_until="domcontentloaded", timeout=120_000)
        print(
            "Sign in with GunBroker if prompted. "
            "If Cloudflare loops, press Ctrl+C and run with --manual.",
            flush=True,
        )
        token = _poll_token(page, deadline=deadline)
    if not token:
        raise RuntimeError(
            f"No gb_session_token within {wait_seconds}s "
            "(Cloudflare may have blocked the automated browser)"
        )
    return token


def capture_token_chrome_profile(
    *,
    wait_seconds: int = 180,
    use_edge: bool = False,
) -> str:
    """Open hub in a copy of your real Chrome/Edge profile (best for Cloudflare)."""
    from playwright.sync_api import sync_playwright

    browsers = list_browser_profiles()
    if not browsers:
        raise RuntimeError("Chrome or Edge not found")

    if use_edge:
        picked = next((b for b in browsers if "Edge" in b[0]), None)
        if not picked:
            raise RuntimeError("Edge not installed")
        label, profile, channel = picked
    else:
        label, profile, channel = browsers[0]

    print(f"Using {label} profile copy (close all {label} windows first).", flush=True)
    tmp_profile = copy_profile_to_temp(profile)
    deadline = time.time() + max(30, wait_seconds)
    token: str | None = None

    try:
        with sync_playwright() as playwright:
            context = playwright.chromium.launch_persistent_context(
                user_data_dir=str(tmp_profile),
                channel=channel,
                headless=False,
            )
            try:
                page = context.pages[0] if context.pages else context.new_page()
                print(f"Loading {HUB_PRICING_URL}", flush=True)
                page.goto(HUB_PRICING_URL, wait_until="domcontentloaded", timeout=120_000)
                print(
                    "Complete Cloudflare / GunBroker login in this window. "
                    "Waiting for session token...",
                    flush=True,
                )
                token = _poll_token(page, deadline=deadline)
            finally:
                context.close()
    finally:
        shutil.rmtree(tmp_profile, ignore_errors=True)

    if not token:
        raise RuntimeError(
            f"No gb_session_token within {wait_seconds}s — try --manual copy from real Chrome"
        )
    return token


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Save Outdoor Analytics API bearer token for live pricing"
    )
    parser.add_argument(
        "--wait-seconds",
        type=int,
        default=300,
        help="Seconds to wait for login (default 300)",
    )
    parser.add_argument(
        "--token",
        default="",
        help="Paste token directly instead of opening a browser",
    )
    parser.add_argument(
        "--token-file",
        default="",
        metavar="PATH",
        help="Read token from a text file (one line, no quotes needed)",
    )
    parser.add_argument(
        "--paste",
        action="store_true",
        help="Prompt: paste token in this window and press Enter",
    )
    parser.add_argument(
        "--manual",
        action="store_true",
        help="Print copy-from-Chrome steps and exit",
    )
    parser.add_argument(
        "--chrome-profile",
        action="store_true",
        help="Use your installed Chrome/Edge profile (recommended on Windows)",
    )
    parser.add_argument(
        "--playwright",
        action="store_true",
        help="Use plain Playwright browser (often blocked by Cloudflare)",
    )
    parser.add_argument("--edge", action="store_true", help="With --chrome-profile, use Edge")
    args = parser.parse_args()

    if args.manual:
        print_manual_instructions()
        return

    token_text = args.token.strip()
    if args.token_file.strip():
        token_path = Path(args.token_file.strip())
        if not token_path.is_file():
            print(f"Token file not found: {token_path}", file=sys.stderr)
            sys.exit(1)
        token_text = token_path.read_text(encoding="utf-8").strip()

    if args.paste and not token_text:
        print(
            "Paste your gb_session_token below (one long line), then press Enter:\n",
            flush=True,
        )
        token_text = sys.stdin.readline().strip()

    if token_text:
        path = save_bearer_token(token_text, source="cli")
        print(f"Saved token to {path}")
        return

    use_profile = args.chrome_profile or (
        not args.playwright and sys.platform == "win32"
    )

    try:
        if use_profile:
            token = capture_token_chrome_profile(
                wait_seconds=args.wait_seconds,
                use_edge=args.edge,
            )
        else:
            token = capture_token_playwright(wait_seconds=args.wait_seconds)
    except KeyboardInterrupt:
        print("\nStopped.", file=sys.stderr)
        print_manual_instructions()
        sys.exit(1)
    except Exception as exc:
        print(f"Capture failed: {exc}", file=sys.stderr)
        print("", file=sys.stderr)
        print_manual_instructions()
        sys.exit(1)

    path = save_bearer_token(token, source="browser")
    print(f"Saved Outdoor Analytics session to {path}")
    print(f"Upload: .\\scripts\\sync-oa-session.ps1 -UploadOnly")


if __name__ == "__main__":
    main()
