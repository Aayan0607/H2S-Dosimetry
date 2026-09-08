import json
from uuid import uuid4

from fastapi import FastAPI, HTTPException, Query, status
from fastapi.middleware.cors import CORSMiddleware

from .database import connect, database_path, decode_row, init_database
from . import firestore_store
from .schemas import AnalysisCreate

app = FastAPI(title="H2S Dosimeter API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
init_database()


@app.get("/")
@app.get("/api")
def api_root() -> dict:
    return {"service": "H2S Dosimeter API", "status": "ok", "docs": "/docs"}


@app.get("/health")
@app.get("/api/health")
def health() -> dict:
    cloud = firestore_store.status()
    return {
        "status": "ok",
        "storage": "firestore" if cloud["connected"] else "sqlite_fallback",
        "firestore": cloud,
        "sqliteDatabase": str(database_path()),
    }


@app.post("/api/v1/analyses", status_code=status.HTTP_201_CREATED)
def create_analysis(payload: AnalysisCreate) -> dict:
    values = payload.model_dump(by_alias=False)
    values["record_id"] = str(uuid4())
    values["firebase_uid"] = None
    json_fields = {"dose_interval_ppm_h", "exposure_interval_ppm_8h", "color", "warnings"}
    for field in json_fields:
        values[field] = json.dumps(values[field]) if values[field] is not None else None
    columns = ", ".join(values)
    placeholders = ", ".join("?" for _ in values)
    with connect() as connection:
        cursor = connection.execute(
            f"INSERT INTO analyses ({columns}) VALUES ({placeholders})",
            tuple(values.values()),
        )
        row = connection.execute("SELECT * FROM analyses WHERE id = ?", (cursor.lastrowid,)).fetchone()
    record = decode_row(row)
    record["storage"] = "firestore" if firestore_store.save(record) else "sqlite_fallback"
    return record


@app.get("/api/v1/analyses")
def list_analyses(limit: int = Query(50, ge=1, le=500)) -> list[dict]:
    cloud_records = firestore_store.list_records(limit)
    if cloud_records is not None:
        return cloud_records
    with connect() as connection:
        rows = connection.execute(
            "SELECT * FROM analyses ORDER BY timestamp DESC, id DESC LIMIT ?", (limit,)
        ).fetchall()
    return [decode_row(row) for row in rows]


@app.get("/api/v1/analyses/{analysis_id}")
def get_analysis(analysis_id: str) -> dict:
    cloud_record = firestore_store.get_record(analysis_id)
    if cloud_record is not None:
        return cloud_record
    with connect() as connection:
        row = connection.execute(
            "SELECT * FROM analyses WHERE record_id = ? OR id = ?",
            (analysis_id, int(analysis_id) if analysis_id.isdigit() else -1),
        ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Analysis not found")
    return decode_row(row)


@app.delete("/api/v1/analyses", status_code=status.HTTP_204_NO_CONTENT)
def clear_analyses() -> None:
    firestore_store.clear_records()
    with connect() as connection:
        connection.execute("DELETE FROM analyses")
