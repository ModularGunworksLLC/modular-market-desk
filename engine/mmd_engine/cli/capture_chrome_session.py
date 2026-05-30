"""Copy GunBroker login from your installed Chrome or Edge profile."""

from __future__ import annotations

import argparse
import shutil
import sys
import time
from pathlib import Path

from mmd_engine.chrome_profile import copy_profile_to_temp, list_browser_profiles
from mmd_engine.config import session_path


def log(msg: str) -> None:
    print(msg, flush=True)


def capture_persistent(
    *,
    profile: Path,
    channel: str,
    url: str,
    out: Path,
) -> None:
    from playwright.sync_api import sync_playwright

    tmp_profile = copy_profile_to_temp(profile, log=log)
    try:
        log(f"Opening {channel} (a window should appear)...")
        with sync_playwright() as playwright:
            context = playwright.chromium.launch_persistent_context(
                user_data_dir=str(tmp_profile),
                channel=channel,
                headless=False,
            )
            try:
                page = context.pages[0] if context.pages else context.new_page()
                log(f"Loading {url}")
                page.goto(url, wait_until="domcontentloaded", timeout=120_000)
                page.wait_for_timeout(5_000)
                title = page.title()
                log(f"Page title: {title[:80] if title else '(none)'}")
                log("Saving session file...")
                context.storage_state(path=str(out))
            finally:
                context.close()
    finally:
        shutil.rmtree(tmp_profile, ignore_errors=True)

    size = out.stat().st_size
    log(f"Saved {out} ({size} bytes)")
    if size < 500:
        raise RuntimeError("Session file too small — login may not have been saved.")


def main() -> None:
    parser = argparse.ArgumentParser(description="Capture GunBroker session from Chrome/Edge")
    parser.add_argument("site", nargs="?", default="gunbroker")
    parser.add_argument("--url", default="https://www.gunbroker.com/")
    parser.add_argument("--edge", action="store_true", help="use Edge instead of Chrome")
    parser.add_argument("-y", "--yes", action="store_true", help="skip Enter prompt")
    args = parser.parse_args()

    browsers = list_browser_profiles()
    if not browsers:
        log("ERROR: No Chrome or Edge install found.")
        sys.exit(1)

    if args.edge:
        picked = next((b for b in browsers if "Edge" in b[0]), None)
        if not picked:
            log("ERROR: Edge not installed.")
            sys.exit(1)
        label, profile, channel = picked
    else:
        label, profile, channel = browsers[0]

    log("Using " + label)

    if not args.yes:
        log("")
        log("Close ALL " + label + " windows (system tray too).")
        input("Press Enter when closed... ")
        log("")

    out = session_path(args.site)
    out.parent.mkdir(parents=True, exist_ok=True)

    try:
        capture_persistent(profile=profile, channel=channel, url=args.url, out=out)
    except Exception as exc:
        log(f"ERROR: {exc}")
        log("")
        log("Tips:")
        log("  - End Chrome/Edge in Task Manager, wait 5 seconds, try again.")
        log("  - If you use Edge for GunBroker, run: capture-gunbroker-from-chrome.ps1 -Edge")
        sys.exit(1)


if __name__ == "__main__":
    main()
