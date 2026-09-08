import os
import json
from pathlib import Path
from typing import Any

import firebase_admin
from firebase_admin import credentials, firestore

DEFAULT_CREDENTIAL_PATH = (
    Path(__file__).resolve().parents[1] / "secrets" / "firebase-service-account.json"
)
COLLECTION = "analyses"
_client = None
_error: str | None = None


def credential_path() -> Path:
    return Path(os.getenv("FIREBASE_SERVICE_ACCOUNT_PATH", DEFAULT_CREDENTIAL_PATH))


def get_client():
    global _client, _error
    if os.getenv("H2S_DISABLE_FIRESTORE") == "1":
        return None
    if _client is not None:
        return _client
    path = credential_path()
    credential_json = os.getenv("FIREBASE_SERVICE_ACCOUNT_JSON")
    if not path.exists() and not credential_json:
        _error = "service account file not found"
        return None
    try:
        if not firebase_admin._apps:
            certificate = json.loads(credential_json) if credential_json else str(path)
            firebase_admin.initialize_app(credentials.Certificate(certificate))
        _client = firestore.client()
        _error = None
        return _client
    except Exception as exc:
        _error = str(exc)
        return None


def status() -> dict[str, Any]:
    client = get_client()
    return {
        "configured": credential_path().exists() or bool(os.getenv("FIREBASE_SERVICE_ACCOUNT_JSON")),
        "connected": client is not None,
        "error": "connection unavailable" if _error else None,
    }


def save(record: dict[str, Any]) -> bool:
    global _error
    client = get_client()
    if client is None:
        return False
    cloud_record = dict(record)
    thumbnail = cloud_record.get("thumbnail")
    if isinstance(thumbnail, str) and len(thumbnail) > 600_000:
        cloud_record["thumbnail"] = None
    try:
        client.collection(COLLECTION).document(str(record["record_id"])).set(cloud_record)
        return True
    except Exception as exc:
        _error = str(exc)
        return False


def list_records(limit: int) -> list[dict[str, Any]] | None:
    global _error
    client = get_client()
    if client is None:
        return None
    try:
        query = client.collection(COLLECTION).order_by(
            "timestamp", direction=firestore.Query.DESCENDING
        ).limit(limit)
        return [document.to_dict() for document in query.stream()]
    except Exception as exc:
        _error = str(exc)
        return None


def get_record(record_id: str) -> dict[str, Any] | None:
    global _error
    client = get_client()
    if client is None:
        return None
    try:
        snapshot = client.collection(COLLECTION).document(str(record_id)).get()
        return snapshot.to_dict() if snapshot.exists else None
    except Exception as exc:
        _error = str(exc)
        return None


def clear_records() -> bool:
    global _error
    client = get_client()
    if client is None:
        return False
    try:
        while True:
            documents = list(client.collection(COLLECTION).limit(400).stream())
            if not documents:
                return True
            batch = client.batch()
            for document in documents:
                batch.delete(document.reference)
            batch.commit()
    except Exception as exc:
        _error = str(exc)
        return False
