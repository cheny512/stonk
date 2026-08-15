from __future__ import annotations

import time

import pytest

from market_predictor.jobs import LocalJobManager


def _wait(manager: LocalJobManager, job_id: str):
    deadline = time.monotonic() + 2
    while time.monotonic() < deadline:
        record = manager.get(job_id)
        if record and record.status in {"succeeded", "failed"}:
            return record
        time.sleep(0.01)
    raise AssertionError("job did not finish")


def test_job_is_persisted_and_idempotent(tmp_path):
    manager = LocalJobManager(tmp_path / "jobs.sqlite3", workers=1)
    calls = []
    first, created = manager.submit("demo", "same-key", {"ticker": "AAPL"}, lambda: calls.append(1) or {"ok": True})
    completed = _wait(manager, first.id)
    second, created_again = manager.submit("demo", "same-key", {"ticker": "AAPL"}, lambda: {"ok": False})

    assert created is True
    assert created_again is False
    assert second.id == first.id
    assert completed.result == {"ok": True}
    assert completed.attempts == 1
    assert calls == [1]


def test_idempotency_key_cannot_be_reused_for_another_payload(tmp_path):
    manager = LocalJobManager(tmp_path / "jobs.sqlite3", workers=1)
    record, _ = manager.submit("demo", "same-key", {"ticker": "AAPL"}, lambda: {"ok": True})
    _wait(manager, record.id)

    with pytest.raises(ValueError, match="different request payload"):
        manager.submit("demo", "same-key", {"ticker": "MSFT"}, lambda: {"ok": True})


def test_job_failure_redacts_credentials(tmp_path):
    manager = LocalJobManager(tmp_path / "jobs.sqlite3", workers=1)

    def fail():
        raise RuntimeError("upstream failed apiKey=super-secret")

    record, _ = manager.submit("demo", "failure", {}, fail)
    completed = _wait(manager, record.id)

    assert completed.status == "failed"
    assert completed.error
    assert "super-secret" not in completed.error["message"]
    assert "REDACTED" in completed.error["message"]
