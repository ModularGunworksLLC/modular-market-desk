"""Reuse installed Chrome/Edge profiles (Cloudflare-friendly vs raw Playwright)."""

from __future__ import annotations

import os
import shutil
import tempfile
from pathlib import Path


def list_browser_profiles() -> list[tuple[str, Path, str]]:
    """label, user_data_dir, playwright channel name."""
    local = Path(os.environ.get("LOCALAPPDATA", ""))
    pf = Path(os.environ.get("PROGRAMFILES", ""))
    pf86 = Path(os.environ.get("PROGRAMFILES(X86)", ""))
    found: list[tuple[str, Path, str]] = []

    chrome_exe = [
        local / "Google/Chrome/Application/chrome.exe",
        pf / "Google/Chrome/Application/chrome.exe",
        pf86 / "Google/Chrome/Application/chrome.exe",
    ]
    if any(p.is_file() for p in chrome_exe) and (local / "Google/Chrome/User Data").is_dir():
        found.append(("Google Chrome", local / "Google/Chrome/User Data", "chrome"))

    edge_exe = [
        pf / "Microsoft/Edge/Application/msedge.exe",
        pf86 / "Microsoft/Edge/Application/msedge.exe",
        local / "Microsoft/Edge/Application/msedge.exe",
    ]
    if any(p.is_file() for p in edge_exe) and (local / "Microsoft/Edge/User Data").is_dir():
        found.append(("Microsoft Edge", local / "Microsoft/Edge/User Data", "msedge"))

    return found


_SKIP_DIRS = {
    "Cache",
    "Code Cache",
    "GPUCache",
    "Service Worker",
    "GrShaderCache",
    "ShaderCache",
    "blob_storage",
    "BrowserMetrics",
    "Crashpad",
    "optimization_guide_hint_cache_store",
}


def copy_profile_to_temp(src: Path, *, log=print) -> Path:
    """Copy profile to temp so Playwright does not fight a live browser lock."""
    tmp_root = Path(tempfile.mkdtemp(prefix="mmd-browser-profile-"))
    log("Copying browser profile to temp (may take 30-60 seconds)...")

    local_state = src / "Local State"
    if local_state.is_file():
        shutil.copy2(local_state, tmp_root / "Local State")

    default_src = src / "Default"
    default_dst = tmp_root / "Default"
    if not default_src.is_dir():
        raise RuntimeError(f"Profile folder not found: {default_src}")

    def _ignore(_dir: str, names: list[str]) -> list[str]:
        return [n for n in names if n in _SKIP_DIRS]

    shutil.copytree(default_src, default_dst, ignore=_ignore, dirs_exist_ok=True)
    log(f"Temp profile ready: {tmp_root}")
    return tmp_root
