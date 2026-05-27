from __future__ import annotations

import csv
import json
from pathlib import Path
from typing import Any

from .config import data_dir


def _cache_root(kind: str) -> Path:
    root = data_dir() / kind
    root.mkdir(parents=True, exist_ok=True)
    return root


def cache_path(kind: str, *parts: str, suffix: str = ".parquet") -> Path:
    return _cache_root(kind).joinpath(*parts).with_suffix(suffix)


def read_json_cache(path: Path) -> Any | None:
    if not path.exists():
        return None
    return json.loads(path.read_text())


def write_json_cache(path: Path, payload: Any) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, sort_keys=True))
    return path


def read_parquet_or_csv(path: Path) -> list[dict[str, Any]] | None:
    if not path.exists():
        return None
    if path.suffix == ".parquet":
        try:
            import pyarrow.parquet as pq
        except ImportError:
            return None
        table = pq.read_table(path)
        return table.to_pylist()
    if path.suffix == ".csv":
        with path.open(newline="") as handle:
            return list(csv.DictReader(handle))
    return None


def write_parquet_or_csv(path: Path, rows: list[dict[str, Any]]) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.suffix == ".parquet":
        try:
            import pyarrow as pa
            import pyarrow.parquet as pq
        except ImportError:
            path = path.with_suffix(".csv")
        else:
            pq.write_table(pa.Table.from_pylist(rows), path)
            return path
    fieldnames = sorted({key for row in rows for key in row})
    with path.open("w", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)
    return path
