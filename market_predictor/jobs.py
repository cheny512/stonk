from __future__ import annotations

import json
import os
import sqlite3
import threading
import uuid
from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable

from .config import project_root
from .security import sanitize_error_message


TERMINAL_STATUSES = {"succeeded", "failed", "interrupted"}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


@dataclass(frozen=True)
class JobRecord:
    id: str
    kind: str
    status: str
    idempotency_key: str
    payload: dict[str, Any]
    result: dict[str, Any] | None
    error: dict[str, str] | None
    attempts: int
    created_at: str
    updated_at: str

    def as_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "kind": self.kind,
            "status": self.status,
            "idempotencyKey": self.idempotency_key,
            "payload": self.payload,
            "result": self.result,
            "error": self.error,
            "attempts": self.attempts,
            "createdAt": self.created_at,
            "updatedAt": self.updated_at,
            "terminal": self.status in TERMINAL_STATUSES,
        }


class JobStore:
    """SQLite-backed job status and idempotency ledger for the local worker."""

    def __init__(self, path: Path) -> None:
        self.path = path
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.Lock()
        self._initialize()

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.path, timeout=30, check_same_thread=False)
        connection.row_factory = sqlite3.Row
        return connection

    @contextmanager
    def _connection(self):
        connection = self._connect()
        try:
            with connection:
                yield connection
        finally:
            connection.close()

    def _initialize(self) -> None:
        with self._connection() as connection:
            connection.execute("PRAGMA journal_mode=WAL")
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS jobs (
                    id TEXT PRIMARY KEY,
                    kind TEXT NOT NULL,
                    status TEXT NOT NULL,
                    idempotency_key TEXT NOT NULL,
                    payload_json TEXT NOT NULL,
                    result_json TEXT,
                    error_code TEXT,
                    error_message TEXT,
                    attempts INTEGER NOT NULL DEFAULT 0,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    UNIQUE(kind, idempotency_key)
                )
                """
            )
            connection.execute(
                """
                UPDATE jobs
                SET status = 'interrupted',
                    error_code = 'worker_restarted',
                    error_message = 'The local worker restarted before this job completed.',
                    updated_at = ?
                WHERE status IN ('queued', 'running')
                """,
                (_now(),),
            )

    @staticmethod
    def _record(row: sqlite3.Row) -> JobRecord:
        return JobRecord(
            id=row["id"],
            kind=row["kind"],
            status=row["status"],
            idempotency_key=row["idempotency_key"],
            payload=json.loads(row["payload_json"]),
            result=json.loads(row["result_json"]) if row["result_json"] else None,
            error=(
                {"code": row["error_code"], "message": row["error_message"]}
                if row["error_code"]
                else None
            ),
            attempts=int(row["attempts"]),
            created_at=row["created_at"],
            updated_at=row["updated_at"],
        )

    def create_or_get(self, kind: str, idempotency_key: str, payload: dict[str, Any]) -> tuple[JobRecord, bool]:
        now = _now()
        job_id = str(uuid.uuid4())
        payload_json = json.dumps(payload, sort_keys=True, separators=(",", ":"))
        with self._lock, self._connection() as connection:
            try:
                connection.execute(
                    "INSERT INTO jobs (id, kind, status, idempotency_key, payload_json, created_at, updated_at) "
                    "VALUES (?, ?, 'queued', ?, ?, ?, ?)",
                    (job_id, kind, idempotency_key, payload_json, now, now),
                )
                created = True
            except sqlite3.IntegrityError:
                created = False
            row = connection.execute(
                "SELECT * FROM jobs WHERE kind = ? AND idempotency_key = ?",
                (kind, idempotency_key),
            ).fetchone()
        if row is None:
            raise RuntimeError("Job ledger failed to return an idempotent record")
        record = self._record(row)
        if not created and record.payload != payload:
            raise ValueError("Idempotency-Key was already used with a different request payload")
        return record, created

    def get(self, job_id: str) -> JobRecord | None:
        with self._connection() as connection:
            row = connection.execute("SELECT * FROM jobs WHERE id = ?", (job_id,)).fetchone()
        return self._record(row) if row else None

    def mark_running(self, job_id: str) -> None:
        with self._connection() as connection:
            connection.execute(
                "UPDATE jobs SET status = 'running', attempts = attempts + 1, updated_at = ? WHERE id = ?",
                (_now(), job_id),
            )

    def mark_succeeded(self, job_id: str, result: dict[str, Any]) -> None:
        encoded = json.dumps(result, separators=(",", ":"), default=str)
        with self._connection() as connection:
            connection.execute(
                "UPDATE jobs SET status = 'succeeded', result_json = ?, error_code = NULL, "
                "error_message = NULL, updated_at = ? WHERE id = ?",
                (encoded, _now(), job_id),
            )

    def mark_failed(self, job_id: str, exc: Exception) -> None:
        with self._connection() as connection:
            connection.execute(
                "UPDATE jobs SET status = 'failed', error_code = ?, error_message = ?, updated_at = ? WHERE id = ?",
                (type(exc).__name__, sanitize_error_message(exc), _now(), job_id),
            )


class LocalJobManager:
    def __init__(self, path: Path, *, workers: int = 2) -> None:
        self.store = JobStore(path)
        self.executor = ThreadPoolExecutor(max_workers=workers, thread_name_prefix="stonk-job")

    def submit(
        self,
        kind: str,
        idempotency_key: str,
        payload: dict[str, Any],
        function: Callable[[], dict[str, Any]],
    ) -> tuple[JobRecord, bool]:
        if not idempotency_key.strip() or len(idempotency_key) > 200:
            raise ValueError("Idempotency-Key must contain between 1 and 200 characters")
        record, created = self.store.create_or_get(kind, idempotency_key.strip(), payload)
        if created:
            self.executor.submit(self._execute, record.id, function)
        return record, created

    def _execute(self, job_id: str, function: Callable[[], dict[str, Any]]) -> None:
        self.store.mark_running(job_id)
        try:
            self.store.mark_succeeded(job_id, function())
        except Exception as exc:
            self.store.mark_failed(job_id, exc)

    def get(self, job_id: str) -> JobRecord | None:
        return self.store.get(job_id)


def configured_job_path() -> Path:
    raw = Path(os.environ.get("STONK_JOB_DB", "./data/jobs.sqlite3"))
    return raw if raw.is_absolute() else project_root() / raw
