from __future__ import annotations

import logging
import os
import sys
from contextvars import ContextVar
from typing import Any

import structlog

# Context variable to store request_id for logging
request_id: ContextVar[str] = ContextVar("request_id", default="")

def configure_logging(level: str = "INFO", json_format: bool = False) -> None:
    """Configures structlog for the application."""
    log_level = os.environ.get("LOG_LEVEL", level).upper()
    log_format = os.environ.get("LOG_FORMAT", "json" if json_format else "console").lower()

    processors: list[Any] = [
        structlog.contextvars.merge_contextvars,
        structlog.processors.add_log_level,
        structlog.processors.StackInfoRenderer(),
        structlog.dev.set_exc_info,
        structlog.processors.TimeStamper(fmt="iso"),
    ]

    if log_format == "json":
        processors.append(structlog.processors.JSONRenderer())
    else:
        processors.append(structlog.dev.ConsoleRenderer())

    structlog.configure(
        processors=processors,
        logger_factory=structlog.PrintLoggerFactory(),
        wrapper_class=structlog.make_filtering_bound_logger(getattr(logging, log_level)),
        cache_logger_on_first_use=True,
    )

def get_logger(name: str | None = None) -> structlog.BoundLogger:
    """Returns a structlog logger."""
    return structlog.get_logger(name)
