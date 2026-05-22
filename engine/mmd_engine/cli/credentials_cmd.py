"""Check which site credentials are configured (passwords never printed)."""

from __future__ import annotations

import argparse
import sys

from mmd_engine.config import SESSIONS_DIR, session_path
from mmd_engine.credentials import EXAMPLE_FILE, SITES_FILE, list_sites, sites_with_adapters


def main() -> None:
    parser = argparse.ArgumentParser(description="Show credential setup status")
    parser.add_argument(
        "--init",
        action="store_true",
        help="Copy sites.local.yaml.example to sites.local.yaml if missing",
    )
    parser.add_argument(
        "--all",
        action="store_true",
        help="Include excluded sites (Kroll, Hicks)",
    )
    parser.add_argument(
        "--firearms-only",
        action="store_true",
        help="Only firearms wholesalers (hide gear/parts/tools)",
    )
    args = parser.parse_args()

    if args.init:
        if SITES_FILE.exists():
            print(f"Already exists: {SITES_FILE}")
        elif EXAMPLE_FILE.exists():
            SITES_FILE.write_text(EXAMPLE_FILE.read_text(encoding="utf-8"), encoding="utf-8")
            print(f"Created {SITES_FILE} — add your logins, then run auth for MFA sites.")
        else:
            print(f"Missing template: {EXAMPLE_FILE}", file=sys.stderr)
            sys.exit(1)
        return

    adapters = set(sites_with_adapters())
    sites = list_sites(firearms_only=args.firearms_only, include_excluded=args.all)

    print(
        f"{'Site':<18} {'On':<5} {'Login':<6} {'Sess':<5} {'Guns':<5} {'API':<6} Notes"
    )
    print("-" * 78)

    for site in sites:
        session = session_path(site.id)
        has_session = session.exists()
        has_login = site.is_configured()
        live = "yes" if site.id in adapters else "—"
        guns = "yes" if site.includes_firearms else "gear"
        flag = "OFF" if site.excluded else ("on" if site.enabled else "off")
        print(
            f"{site.id:<18} {flag:<5} {str(has_login):<6} {str(has_session):<5} "
            f"{guns:<5} {live:<6} {site.notes[:32]}"
        )

    if not args.all:
        print("\nExcluded (hidden): kroll, hicks — use --all to show")

    print(f"\nSessions: {SESSIONS_DIR}")
    print("MFA login: python -m mmd_engine.cli.auth <site_id>")


if __name__ == "__main__":
    main()
