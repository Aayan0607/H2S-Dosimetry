"""
Unit Tests for DosimeterQualityGate.
Verifies dynamic blur, chemical strip specular glare detection, exposure & shadow uniformity,
perspective tilt calculation, lightweight model-based classification, and overall gating decisions.
"""

import unittest
import numpy as np
import cv2

from dosimeter_cv.models import CardGeometryConfig
from dosimeter_cv.synthetic import generate_canonical_badge
from dosimeter_cv.quality import (
    DosimeterQualityGate,
    QualityReport,
    QualityCategory,
)


class TestDosimeterQualityGate(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        cls.config = CardGeometryConfig()
        cls.gate = DosimeterQualityGate()
        cls.canonical_badge, cls.payload = generate_canonical_badge(
            config=cls.config,
            batch_id="TEST-BATCH-2026",
            exposure_state="moderate"
        )
        cls.h, cls.w = cls.canonical_badge.shape[:2]
        # Standard sensor ROI (Block 3: ~64% to 92% width, 18% to 82% height)
        cls.sensor_roi = (
            int(cls.w * 0.64),
            int(cls.h * 0.18),
            int(cls.w * 0.28),
            int(cls.h * 0.64)
        )
        # Reference bar ROI (Block 2: ~32% to 60% width, 18% to 82% height)
        cls.ref_roi = (
            int(cls.w * 0.32),
            int(cls.h * 0.18),
            int(cls.w * 0.28),
            int(cls.h * 0.64)
        )

    def test_canonical_pristine_scan_passes(self):
        """Test that a sharp, evenly illuminated, parallel scan passes quality gate with high score."""
        report = self.gate.evaluate(
            image_bgr=self.canonical_badge,
            rectified_badge=self.canonical_badge,
            sensor_roi=self.sensor_roi,
            ref_roi=self.ref_roi
        )

        self.assertTrue(report.is_valid)
        self.assertGreaterEqual(report.quality_score, 70.0)
        self.assertEqual(report.predicted_category, QualityCategory.VALID_SCAN)
        self.assertEqual(len(report.actionable_warnings), 0)

        # Check metrics
        self.assertIn("raw_sharpness", report.metrics)
        self.assertIn("blur_threshold", report.metrics)
        self.assertIn("glare_sensor_pct", report.metrics)
        self.assertIn("mean_luminance", report.metrics)
        self.assertIn("quadrant_delta_l", report.metrics)
        self.assertIn("tilt_angle_deg", report.metrics)

        # Check category confidences
        for cat in QualityCategory:
            self.assertIn(cat.value, report.category_confidences)
            self.assertGreaterEqual(report.category_confidences[cat.value], 0.0)
        self.assertAlmostEqual(sum(report.category_confidences.values()), 1.0, places=2)

    def test_blurred_scan_detection(self):
        """Test that motion/defocus blur triggers warning and lowers quality score."""
        blurry_badge = cv2.GaussianBlur(self.canonical_badge, (35, 35), sigmaX=12.0)

        report = self.gate.evaluate(
            image_bgr=blurry_badge,
            rectified_badge=blurry_badge,
            sensor_roi=self.sensor_roi,
            ref_roi=self.ref_roi
        )

        self.assertFalse(report.is_valid)
        self.assertIn(
            "BLUR DETECTED: Hold phone steady and tap the badge to autofocus",
            report.actionable_warnings
        )
        self.assertEqual(report.predicted_category, QualityCategory.OUT_OF_FOCUS)

    def test_specular_glare_on_sensor_triggers_warning(self):
        """Test that specular reflections covering > 2.5% on sensor strip trigger actionable warning."""
        glare_badge = self.canonical_badge.copy()
        sx, sy, sw, sh = self.sensor_roi

        # Create a blown-out specular highlight inside the sensor strip
        # 15% of the sensor strip width and height
        gw, gh = int(sw * 0.4), int(sh * 0.4)
        gx, gy = sx + 20, sy + 20
        # Blown out flat white (texture collapse)
        glare_badge[gy:gy+gh, gx:gx+gw] = (255, 255, 255)

        report = self.gate.evaluate(
            image_bgr=glare_badge,
            rectified_badge=glare_badge,
            sensor_roi=self.sensor_roi,
            ref_roi=self.ref_roi
        )

        self.assertFalse(report.is_valid)
        self.assertGreater(report.metrics["glare_sensor_pct"], 2.5)
        self.assertIn(
            "GLARE ON SENSOR: Tilt phone 10-15 degrees away from overhead lights to remove glare",
            report.actionable_warnings
        )
        self.assertEqual(report.predicted_category, QualityCategory.GLARE_PRESENT)

    def test_diffuse_white_paper_not_flagged_as_glare(self):
        """Test that textured white paper does NOT trigger false glare."""
        # Clean canonical badge contains white paper substrate and white reference swatch
        report = self.gate.evaluate(
            image_bgr=self.canonical_badge,
            rectified_badge=self.canonical_badge,
            sensor_roi=self.sensor_roi,
            ref_roi=self.ref_roi
        )

        self.assertLessEqual(report.metrics["glare_sensor_pct"], 2.5)
        self.assertNotIn(
            "GLARE ON SENSOR: Tilt phone 10-15 degrees away from overhead lights to remove glare",
            report.actionable_warnings
        )

    def test_shadow_detection(self):
        """Test that harsh shadows (delta_L > 35) trigger warning."""
        shadow_badge = self.canonical_badge.copy().astype(np.float32)
        # Darken the left half severely to simulate half-badge shadow
        mid_x = shadow_badge.shape[1] // 2
        shadow_badge[:, :mid_x] *= 0.35
        shadow_badge = np.clip(shadow_badge, 0, 255).astype(np.uint8)

        report = self.gate.evaluate(
            image_bgr=shadow_badge,
            rectified_badge=shadow_badge,
            sensor_roi=self.sensor_roi,
            ref_roi=self.ref_roi
        )

        self.assertGreater(report.metrics["quadrant_delta_l"], 35.0)
        self.assertIn(
            "SHADOW DETECTED: Move to evenly lit area or use phone flash",
            report.actionable_warnings
        )

    def test_underexposure_and_overexposure(self):
        """Test underexposure (< 50) and overexposure (> 220) detection."""
        # Dark image
        dark_badge = (self.canonical_badge * 0.15).astype(np.uint8)
        report_dark = self.gate.evaluate(image_bgr=dark_badge)
        self.assertIn(
            "UNDEREXPOSURE: Move to a brighter area or turn on phone flash",
            report_dark.actionable_warnings
        )
        self.assertFalse(report_dark.is_valid)

        # Washed out image
        bright_badge = np.clip(self.canonical_badge.astype(np.float32) + 160, 0, 255).astype(np.uint8)
        report_bright = self.gate.evaluate(image_bgr=bright_badge)
        self.assertIn(
            "OVEREXPOSURE: Shield from direct harsh sun or flash wash-out",
            report_bright.actionable_warnings
        )

    def test_perspective_tilt_warning(self):
        """Test that steep capture angles (> 25 deg skew) trigger tilt warning."""
        # Skewed quad corners (keystone / trapezoid distortion)
        skewed_corners = np.array([
            [100, 80],
            [900, 20],
            [1080, 420],
            [20, 360]
        ], dtype=np.float32)

        report = self.gate.evaluate(
            image_bgr=self.canonical_badge,
            badge_corners=skewed_corners
        )

        self.assertGreater(report.metrics["tilt_angle_deg"], 25.0)
        self.assertIn(
            "TILT DETECTED: Hold smartphone parallel to the wristband",
            report.actionable_warnings
        )

    def test_empty_corrupted_image_buffer(self):
        """Test graceful handling of None or zero-sized image."""
        empty = np.zeros((0, 0, 3), dtype=np.uint8)
        report = self.gate.evaluate(image_bgr=empty)
        self.assertFalse(report.is_valid)
        self.assertEqual(report.quality_score, 0.0)
        self.assertTrue(any("IMAGE_CORRUPT" in w for w in report.actionable_warnings))


if __name__ == "__main__":
    unittest.main()
