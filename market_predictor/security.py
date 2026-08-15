from __future__ import annotations

import re


_SECRET_PATTERNS = (
    re.compile(r"(?i)(api[_-]?key|token|authorization|password|secret)(\s*[=:]\s*)([^\s&]+)"),
    re.compile(r"(?i)([?&](?:apiKey|api_key|token|key)=)[^&\s]+"),
    re.compile(r"(?i)(bearer\s+)[A-Za-z0-9._~+/-]+"),
)


def sanitize_error_message(value: object, *, maximum: int = 500) -> str:
    message = str(value)
    for pattern in _SECRET_PATTERNS:
        message = pattern.sub(lambda match: f"{match.group(1)}[REDACTED]", message)
    message = message.replace("\n", " ").replace("\r", " ").strip()
    return message[:maximum] or "Unexpected error"
