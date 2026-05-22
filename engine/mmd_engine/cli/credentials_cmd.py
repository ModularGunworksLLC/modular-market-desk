"""Check which site credentials are configured (passwords never printed)."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from mmd_engine.config import SESSIONS_DIR, session_path
from mmd_engine.credentials import EXAMPLE_FILE, SITES_FILE, list_sites, sites_with_adapters


def main() -> None:
    parser = argparse.ArgumentParser(description="Show credential setup status")
    parser.add_argument(
        "--init",
        action="store_true",
        help="Copy sites.local.yaml.example to sites.local.yaml if missing",
    )
    args = parser.parse_args()

    if args.init:
        if SITES_FILE.exists():
            print(f"Already exists: {SITES_FILE}")
        elif EXAMPLE_FILE.exists():
            SITES_FILE.write_text(EXAMPLE_FILE.read_text(encoding="utf-8"), encoding="utf-8")
            print(f"Created {SITES_FILE} — edit your logins, then run auth for MFA sites.")
        else:
            print(f"Missing template: {EXAMPLE_FILE}", file=sys.stderr)
            sys.exit(1)
        return

    if not SITES_FILE.exists() and not Path(EXAMPLE_FILE.parent / ".env").exists():
        print("No credentials file yet.")
        print(f"  Option A: copy {EXAMPLE_FILE.name} -> sites.local.yaml")
        print("  Option B: copy .env.example -> .env")
        print("  Then: python -m mmd_engine.cli.credentials_cmd --init")
        print()

    adapters = set(sites_with_adapters())
    print(f"{'Site':<16} {'Enabled':<8} {'Login':<8} {'Session':<8} {'Live adapter':<14} Notes")
    print("-" * 72)

    for site in list_sites():
        session = session_path(site.id)
        has_session = session.exists()
        has_login = site.is_configured()
        live = "yes" if site.id in adapters else "planned"
        print(
            f"{site.id:<16} {str(site.enabled):<8} {str(has_login):<8} "
            f"{str(has_session):<8} {live:<14} {site.notes[:30]}"
        )

    print()
    print(f"Sessions folder: {SESSIONS_DIR}")
    print("MFA login: python -m mmd_engine.cli.auth <site_id>")


if __name__ == "__main__":
    main()
