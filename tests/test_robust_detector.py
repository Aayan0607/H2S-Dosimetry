"""
Comprehensive Unit Tests for RobustDosimeterDetector.
Verifies multi-stage substrate isolation, dual QR anchor localization,
180° rotation correction, failsafe geometric projection on low-contrast strips,
and sub-ROI extraction with eroded swatches.
"""

import unittest
import numpy as np
import cv2

from dosimeter_cv.models import CardGeometryConfig
from dosimeter_cv.synthetic import generate_canonical_badge, generate_scene_image
from robust_block_detector import RobustDosimeterDetector, DetectionResult


class TestRobustDosimeterDetector(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        cls.detector = RobustDosimeterDetector()
        cls.config = CardGeometryConfig()
        cls.canonical_badge, cls.payload = generate_canonical_badge(
            config=cls.config,
            batch_id="TEST-ROBUST-2026",
            exposure_state="moderate"
        )

    def test_canonical_wristband_detection(self):
        """Test detection on a clean canonical wristband image."""
        result = self.detector.detect_all_blocks(self.canonical_badge)

        self.assertTrue(result.success)
        self.assertEqual(result.rectified_band.shape, (400, 1000, 3))
        self.assertIsNotNone(result.annotated_debug_image)
        self.assertGreaterEqual(result.confidence_score, 0.70)

        # Check ROIs
        expected_rois = ["qr", "reference_bar", "sensor_strip", "control_patch"]
        for k in expected_rois:
            self.assertIn(k, result.rois)
            crop = result.rois[k]
            self.assertGreater(crop.shape[0], 20)
            self.assertGreater(crop.shape[1], 20)

        # Check Bounding Boxes
        for k in expected_rois:
            self.assertIn(k, result.bounding_boxes)
            x, y, w, h = result.bounding_boxes[k]
            self.assertGreater(w, 20)
            self.assertGreater(h, 20)

        # Check Swatches
        self.assertEqual(len(result.swatches), 7)
        self.assertEqual(result.swatches[0].name, "White")
        self.assertEqual(result.swatches[2].name, "Black")

    def test_cluttered_scene_with_perspective_skew(self):
        """Test detection when badge is photographed in a cluttered scene with slant."""
        scene, _ = generate_scene_image(
            self.canonical_badge,
            scene_width=1400,
            scene_height=900,
            rotation_deg=0,
            perspective_skew=0.07,
            noise_sigma=1.5
        )

        result = self.detector.detect_all_blocks(scene)
        self.assertTrue(result.success)
        self.assertEqual(result.rectified_band.shape, (400, 1000, 3))
        self.assertIn("qr", result.rois)
        self.assertIn("sensor_strip", result.rois)

    def test_inverted_badge_180_rotation(self):
        """Test that an upside-down badge is automatically realigned to canonical orientation."""
        inverted = cv2.rotate(self.canonical_badge, cv2.ROTATE_180)
        result = self.detector.detect_all_blocks(inverted)

        self.assertTrue(result.success)
        self.assertEqual(result.rotation_applied_deg, 180)
        self.assertEqual(result.rectified_band.shape, (400, 1000, 3))

        # Check that after rotation, White swatch is on left side of reference palette (index 0)
        self.assertEqual(result.swatches[0].name, "White")
        self.assertGreater(result.swatches[0].mean_rgb[0], 180)

    def test_unexposed_zero_contrast_sensor_strip(self):
        """
        Verify that even if the Cu-reagent sensor strip has zero contrast
        (identical to white paper background), geometric projection accurately isolates Block 3.
        """
        unexposed_badge, _ = generate_canonical_badge(
            config=self.config,
            batch_id="TEST-UNEXPOSED",
            exposure_state="unexposed"
        )

        result = self.detector.detect_all_blocks(unexposed_badge)
        self.assertTrue(result.success)
        self.assertIn("sensor_strip", result.rois)

        sx, sy, sw, sh = result.bounding_boxes["sensor_strip"]
        # Standard sensor strip horizontal location should be around x in [640, 700]
        self.assertGreaterEqual(sx, 600)
        self.assertLessEqual(sx, 720)
        self.assertGreater(sw, 100)

    def test_empty_image_error_handling(self):
        """Test graceful failure handling without exceptions on None or empty image."""
        empty = np.zeros((0, 0, 3), dtype=np.uint8)
        result = self.detector.detect_all_blocks(empty)
        self.assertFalse(result.success)
        self.assertEqual(result.confidence_score, 0.0)

        none_res = self.detector.detect_all_blocks(None)
        self.assertFalse(none_res.success)


if __name__ == "__main__":
    unittest.main()
