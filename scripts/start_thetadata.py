#!/usr/bin/env python3
"""Start Theta Terminal v3 without exposing credentials in process arguments."""

from __future__ import annotations

import os
import re
import shutil
import stat
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from market_predictor.config import (
    project_root,
    thetadata_api_key,
    thetadata_base_url,
    thetadata_password,
    thetadata_username,
)


def _java_binary() -> str:
    configured = os.getenv("THETADATA_JAVA_BIN", "").strip()
    candidates = [configured, "/opt/homebrew/opt/openjdk@21/bin/java", shutil.which("java") or ""]
    for candidate in candidates:
        if candidate and Path(candidate).is_file() and os.access(candidate, os.X_OK):
            return candidate
    raise RuntimeError("Java 21+ is required. Install it with: brew install openjdk@21")


def _java_major(java: str) -> int:
    result = subprocess.run([java, "-version"], capture_output=True, text=True, check=False)
    match = re.search(r'version "(?:1\.)?(\d+)', result.stderr or result.stdout)
    return int(match.group(1)) if match else 0


def _terminal_jar() -> Path:
    configured = os.getenv("THETADATA_TERMINAL_JAR", "").strip()
    candidates = [
        Path(configured).expanduser() if configured else None,
        project_root() / "ThetaTerminalv3.jar",
        project_root().parent / "ThetaTerminalv3.jar",
        project_root().parent / "ThetaTerminalv3 (1).jar",
    ]
    for candidate in candidates:
        if candidate and candidate.is_file():
            return candidate.resolve()
    raise RuntimeError("ThetaTerminalv3.jar was not found. Set THETADATA_TERMINAL_JAR in .env.")


def _temporary_creds_file() -> Path | None:
    if thetadata_api_key():
        return None
    username = thetadata_username()
    password = thetadata_password()
    if not username or not password:
        raise RuntimeError(
            "Set THETADATA_API_KEY, or set THETADATA_USERNAME and THETADATA_PASSWORD for the legacy creds flow."
        )
    handle = tempfile.NamedTemporaryFile(
        mode="w",
        encoding="utf-8",
        prefix="thetadata-creds-",
        suffix=".txt",
        delete=False,
    )
    try:
        handle.write(f"{username}\n{password}\n")
        return Path(handle.name)
    finally:
        handle.close()
        os.chmod(handle.name, stat.S_IRUSR | stat.S_IWUSR)


def main() -> int:
    try:
        java = _java_binary()
        major = _java_major(java)
        if major < 21:
            raise RuntimeError(f"Theta Terminal v3 requires Java 21+; selected Java reports version {major}.")
        jar = _terminal_jar()
        creds_file = _temporary_creds_file()
    except RuntimeError as exc:
        print(exc, file=sys.stderr)
        return 1

    command = [java, "-jar", str(jar)]
    if creds_file is not None:
        command.extend(["--creds-file", str(creds_file)])

    print(f"Starting Theta Terminal v3 at {thetadata_base_url()}")
    print("Keep this process running while using Stonk. Press Ctrl+C to stop it.")
    child_env = os.environ.copy()
    java_path = Path(java).resolve()
    child_env["JAVA_HOME"] = str(java_path.parents[1])
    child_env["PATH"] = f"{java_path.parent}{os.pathsep}{child_env.get('PATH', '')}"
    try:
        return subprocess.run(command, cwd=jar.parent, env=child_env, check=False).returncode
    except KeyboardInterrupt:
        return 130
    finally:
        if creds_file is not None:
            creds_file.unlink(missing_ok=True)


if __name__ == "__main__":
    raise SystemExit(main())
