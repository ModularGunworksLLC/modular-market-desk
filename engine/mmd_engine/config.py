import os
from pathlib import Path

from dotenv import load_dotenv

ENGINE_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = ENGINE_ROOT.parent
SESSIONS_DIR = ENGINE_ROOT / "data" / "sessions"
WEB_DATA_PATH = REPO_ROOT / "web" / "public" / "data" / "bundle.json"

load_dotenv(ENGINE_ROOT / ".env")


def env(name: str, default: str = "") -> str:
    return os.getenv(name, default).strip()


def api_key() -> str:
    return env("MMD_API_KEY")


def nav_timeout_ms() -> int:
    raw = env("MMD_NAV_TIMEOUT_MS", "120000")
    try:
        return max(30_000, int(raw))
    except ValueError:
        return 120_000


def nav_wait_until() -> str:
    """Playwright wait_until: commit is faster and more reliable than domcontentloaded on slow sites."""
    value = env("MMD_NAV_WAIT_UNTIL", "commit").lower()
    if value in {"commit", "domcontentloaded", "load", "networkidle"}:
        return value
    return "commit"


def scrape_serial() -> bool:
    return env("MMD_SERIALIZE_MARKET_SCRAPERS", "").lower() in {"1", "true", "yes"}


def session_path(dealer: str) -> Path:
    return SESSIONS_DIR / f"{dealer}.json"
