"""Build bundle.json for the web dashboard."""

from __future__ import annotations

import argparse
import json
import logging
from pathlib import Path

from mmd_engine.config import WEB_DATA_PATH
from mmd_engine.filters import SearchFilters
from mmd_engine.service.search import run_search

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")


def run_sync(
    query: str,
    write_web: Path | None,
    *,
    sample_only: bool = False,
    skip_dealers: bool = False,
) -> None:
    bundle = run_search(
        query,
        filters=SearchFilters(query=query),
        include_sample=True,
        include_market=not sample_only,
        include_dealers=not skip_dealers,
    )

    if write_web:
        write_web.parent.mkdir(parents=True, exist_ok=True)
        write_web.write_text(json.dumps(bundle.to_dict(), indent=2) + "\n", encoding="utf-8")
        print(
            f"Wrote {write_web} ({len(bundle.catalog)} catalog, {len(bundle.comps)} comps)"
        )


def main() -> None:
    parser = argparse.ArgumentParser(description="Sync market data to web/public/data/bundle.json")
    parser.add_argument("--query", "-q", default="", help="Search query used when fetching")
    parser.add_argument(
        "--write-web",
        type=Path,
        nargs="?",
        const=WEB_DATA_PATH,
        default=WEB_DATA_PATH,
        help="Write bundle.json for GitHub Pages",
    )
    parser.add_argument(
        "--sample-only",
        action="store_true",
        help="Use sample data only (no Playwright / external sites)",
    )
    parser.add_argument(
        "--skip-dealers",
        action="store_true",
        help="Skip Lipsey's and Zanders adapters",
    )
    args = parser.parse_args()
    run_sync(
        args.query,
        args.write_web,
        sample_only=args.sample_only,
        skip_dealers=args.skip_dealers or args.sample_only,
    )


if __name__ == "__main__":
    main()
