from datetime import datetime, timezone
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class AnalysisCreate(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    timestamp: str = Field(default_factory=now_iso)
    badge_id: str | None = Field(None, alias="badgeId")
    worker_id: str | None = Field(None, alias="workerId")
    worker_name: str | None = Field(None, alias="workerName")
    department: str | None = None
    shift: str | None = None
    site: str | None = None
    batch_id: str | None = Field(None, alias="batchId")
    issue_date: str | None = Field(None, alias="issueDate")
    expiry_date: str | None = Field(None, alias="expiryDate")
    category: str
    risk: str
    confidence: float = Field(ge=0, le=1)
    estimated_dose_ppm_h: float | None = Field(None, alias="estimatedDosePpmH")
    estimated_exposure_ppm_8h: float | None = Field(None, alias="estimatedExposurePpm8h")
    dose_interval_ppm_h: list[float] | None = Field(None, alias="doseIntervalPpmH")
    exposure_interval_ppm_8h: list[float] | None = Field(None, alias="exposureIntervalPpm8h")
    color: dict[str, Any] | list[float] | None = None
    delta_e: float | None = Field(None, alias="deltaE")
    image_quality: str | None = Field(None, alias="imageQuality")
    qr_status: str | None = Field(None, alias="qrStatus")
    calibration: str | None = None
    warnings: list[str] = Field(default_factory=list)
    thumbnail: str | None = None


class AnalysisRecord(AnalysisCreate):
    id: int
    created_at: str = Field(alias="createdAt")
