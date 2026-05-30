import os
from pathlib import Path

from dotenv import load_dotenv

ENGINE_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = ENGINE_ROOT.parent


def _resolve_sessions_dir() -> Path:
    """Docker mounts host sessions at /app/data/sessions; pip install uses site-packages."""
    override = os.getenv("MMD_SESSIONS_DIR", "").strip()
    if override:
        return Path(override)
    docker_sessions = Path("/app/data/sessions")
    if docker_sessions.is_dir():
        return docker_sessions
    return ENGINE_ROOT / "data" / "sessions"


SESSIONS_DIR = _resolve_sessions_dir()
WEB_DATA_PATH = REPO_ROOT / "web" / "public" / "data" / "bundle.json"

for _env_path in (
    Path("/app/.env"),
    ENGINE_ROOT / ".env",
    Path("/opt/modular-market-desk/engine/.env"),
):
    if _env_path.is_file():
        load_dotenv(_env_path)
        break
else:
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


def proxy_server() -> str | None:
    """Residential proxy URL, e.g. http://user:pass@gate.smartproxy.com:7000"""
    value = env("MMD_PROXY_SERVER")
    return value if value else None


def allow_cache_fallback() -> bool:
    return env("MMD_ALLOW_CACHE_FALLBACK", "false").lower() in {"1", "true", "yes"}


def legacy_market_scrapers_enabled() -> bool:
    """When false (default), only Outdoor Analytics is used for live market pricing."""
    return env("MMD_LEGACY_MARKET_SCRAPERS", "").lower() in {"1", "true", "yes"}


def skip_market_sources() -> frozenset[str]:
    """Comma-separated adapter names to skip."""
    raw = env("MMD_SKIP_MARKET_SOURCES", "")
    if not raw:
        return frozenset()
    return frozenset(s.strip().lower() for s in raw.split(",") if s.strip())


def session_path(dealer: str) -> Path:
    return SESSIONS_DIR / f"{dealer}.json"


def oa_session_path() -> Path:
    return SESSIONS_DIR / "outdoor_analytics.json"


def oa_api_base() -> str:
    return env(
        "MMD_OA_API_BASE",
        "https://api.gunbrokeranalytics.com/gba-portal-api",
    ).rstrip("/")
