import json
import os
import sqlite3
from contextlib import contextmanager
from pathlib import Path
from typing import Any

DEFAULT_DATABASE_PATH = Path(__file__).resolve().parents[1] / "data" / "h2s_dosimeter.db"


def database_path() -> Path:
    if os.getenv("VERCEL"):
        return Path("/tmp/h2s_dosimeter.db")
    return Path(os.getenv("H2S_DATABASE_PATH", DEFAULT_DATABASE_PATH))


@contextmanager
def connect():
    path = database_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(path, timeout=10)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    connection.execute("PRAGMA journal_mode = WAL")
    try:
        yield connection
        connection.commit()
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


def init_database() -> None:
    with connect() as connection:
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS analyses (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                record_id TEXT UNIQUE,
                firebase_uid TEXT,
                timestamp TEXT NOT NULL,
                badge_id TEXT,
                worker_id TEXT,
                worker_name TEXT,
                department TEXT,
                shift TEXT,
                site TEXT,
                batch_id TEXT,
                issue_date TEXT,
                expiry_date TEXT,
                category TEXT NOT NULL,
                risk TEXT NOT NULL,
                confidence REAL NOT NULL,
                estimated_dose_ppm_h REAL,
                estimated_exposure_ppm_8h REAL,
                dose_interval_ppm_h TEXT,
                exposure_interval_ppm_8h TEXT,
                color TEXT,
                delta_e REAL,
                image_quality TEXT,
                qr_status TEXT,
                calibration TEXT,
                warnings TEXT,
                thumbnail TEXT,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        existing_columns = {
            row["name"] for row in connection.execute("PRAGMA table_info(analyses)").fetchall()
        }
        for column in ("record_id", "firebase_uid", "department", "issue_date", "expiry_date"):
            if column not in existing_columns:
                connection.execute(f"ALTER TABLE analyses ADD COLUMN {column} TEXT")


JSON_COLUMNS = {
    "dose_interval_ppm_h",
    "exposure_interval_ppm_8h",
    "color",
    "warnings",
}


def decode_row(row: sqlite3.Row) -> dict[str, Any]:
    result = dict(row)
    for column in JSON_COLUMNS:
        if result.get(column):
            result[column] = json.loads(result[column])
    return result
