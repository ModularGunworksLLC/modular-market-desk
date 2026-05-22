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


def session_path(dealer: str) -> Path:
    return SESSIONS_DIR / f"{dealer}.json"
