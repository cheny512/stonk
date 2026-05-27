from __future__ import annotations

import http.server
import socketserver
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
UI_DIR = ROOT / "ui" / "dist"


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(UI_DIR), **kwargs)

    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


def main() -> int:
    if not UI_DIR.exists():
        print("Build the React UI first: cd ui && npm install && npm run build")
        return 1
    port = 8765
    with socketserver.TCPServer(("127.0.0.1", port), Handler) as httpd:
        print(f"stonk production UI running at http://127.0.0.1:{port}")
        httpd.serve_forever()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
