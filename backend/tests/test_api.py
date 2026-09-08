import os
import tempfile
import unittest
from pathlib import Path

TEMP_DIRECTORY = tempfile.TemporaryDirectory()
os.environ["H2S_DATABASE_PATH"] = str(Path(TEMP_DIRECTORY.name) / "test.db")
os.environ["H2S_DISABLE_FIRESTORE"] = "1"

from backend.app.main import clear_analyses, create_analysis, get_analysis, health, list_analyses
from backend.app.schemas import AnalysisCreate


class AnalysisApiTests(unittest.TestCase):
    def setUp(self):
        clear_analyses()

    def test_create_list_and_get_analysis(self):
        created = create_analysis(
            AnalysisCreate(
                badgeId="BADGE-001",
                workerId="WKR-001",
                workerName="Test Worker",
                department="Operations",
                shift="Day A",
                site="Unit 1",
                batchId="BATCH-001",
                issueDate="2026-09-01",
                expiryDate="2026-12-01",
                category="Moderate",
                risk="moderate",
                confidence=0.88,
                estimatedDosePpmH=12.4,
                estimatedExposurePpm8h=1.55,
                color={"r": 180, "g": 170, "b": 140},
            )
        )
        self.assertEqual(created["badge_id"], "BADGE-001")
        self.assertEqual(created["worker_id"], "WKR-001")
        self.assertEqual(created["department"], "Operations")
        self.assertEqual(created["batch_id"], "BATCH-001")
        self.assertEqual(created["expiry_date"], "2026-12-01")
        self.assertIsNone(created["firebase_uid"])
        self.assertEqual(len(list_analyses(50)), 1)
        self.assertTrue(created["record_id"])
        self.assertEqual(get_analysis(created["record_id"])["estimated_exposure_ppm_8h"], 1.55)
        self.assertEqual(health()["status"], "ok")


if __name__ == "__main__":
    unittest.main()
