"""
Comprehensive Unit Tests for DosimeterBlockDetector.
Tests detection, 4-corner perspective rectification, 180° rotation correction,
sub-ROI cropping, and 7-swatch optical reference palette segmentation.
"""

import unittest
import numpy as np
import cv2

from dosimeter_cv.models import CardGeometryConfig
from dosimeter_cv.detector import DosimeterBlockDetector
from dosimeter_cv.synthetic import generate_canonical_badge, generate_scene_image


class TestDosimeterBlockDetector(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        cls.config = CardGeometryConfig()
        cls.detector = DosimeterBlockDetector(config=cls.config)
        cls.canonical_badge, cls.payload = generate_canonical_badge(
            config=cls.config,
            batch_id="TEST-BATCH-2026",
            exposure_state="moderate"
        )

    def test_canonical_badge_direct_rectification(self):
        """Test detector on canonical pristine image."""
        result = self.detector.detect_and_rectify(self.canonical_badge)

        self.assertTrue(result.success)
        self.assertEqual(result.rectified_badge.shape, (400, 1000, 3))
        self.assertIsNotNone(result.annotated_image)

        # Verify ROI crops
        expected_crops = ["qr", "reference_bar", "sensor_strip", "control_patch"]
        for k in expected_crops:
            self.assertIn(k, result.roi_crops)
            crop = result.roi_crops[k]
            self.assertGreater(crop.shape[0], 10)
            self.assertGreater(crop.shape[1], 10)

        # Verify Swatches
        self.assertEqual(len(result.swatches), 7)
        swatch_names = [s.name for s in result.swatches]
        self.assertEqual(swatch_names, [
            "White", "50% Gray", "Black", "Red", "Green", "Blue", "Yellow"
        ])

        # Verify swatch color properties
        # White: high RGB
        white = result.swatches[0]
        self.assertGreater(white.median_rgb[0], 200)
        self.assertGreater(white.median_rgb[1], 200)
        self.assertGreater(white.median_rgb[2], 200)

        # Black: low RGB
        black = result.swatches[2]
        self.assertLess(black.median_rgb[0], 60)
        self.assertLess(black.median_rgb[1], 60)
        self.assertLess(black.median_rgb[2], 60)

        # Red: R component dominant
        red = result.swatches[3]
        self.assertGreater(red.median_rgb[0], red.median_rgb[1] + 50)
        self.assertGreater(red.median_rgb[0], red.median_rgb[2] + 50)

    def test_inverted_badge_180_rotation_correction(self):
        """Test that an upside-down badge is automatically rotated 180° to canonical orientation."""
        inverted = cv2.rotate(self.canonical_badge, cv2.ROTATE_180)
        result = self.detector.detect_and_rectify(inverted)

        self.assertTrue(result.success)
        self.assertEqual(result.rotation_applied_deg, 180)
        self.assertEqual(result.rectified_badge.shape, (400, 1000, 3))

        # Check that after rotation, White swatch is on the left side of reference palette (index 0)
        white_swatch = result.swatches[0]
        self.assertEqual(white_swatch.name, "White")
        self.assertGreater(white_swatch.median_rgb[0], 180)

    def test_badge_in_perspective_scene(self):
        """Test detection and rectification from a camera scene with background and slant."""
        scene, _ = generate_scene_image(
            self.canonical_badge,
            scene_width=1300,
            scene_height=850,
            rotation_deg=0,
            perspective_skew=0.08,
            noise_sigma=1.5
        )

        result = self.detector.detect_and_rectify(scene)
        self.assertTrue(result.success)
        self.assertEqual(result.rectified_badge.shape, (400, 1000, 3))
        self.assertGreater(len(result.swatches), 0)

    def test_swatch_margin_erosion(self):
        """Verify that eroded crops strictly exclude border regions."""
        result = self.detector.detect_and_rectify(self.canonical_badge)
        for sw in result.swatches:
            raw_h, raw_w = sw.crop.shape[:2]
            eroded_h, eroded_w = sw.eroded_crop.shape[:2]
            self.assertLess(eroded_h, raw_h)
            self.assertLess(eroded_w, raw_w)

    def test_invalid_image_handling(self):
        """Verify graceful error handling for empty or None images."""
        with self.assertRaises(ValueError):
            self.detector.detect_and_rectify(None)

        with self.assertRaises(ValueError):
            self.detector.detect_and_rectify(np.array([]))


if __name__ == "__main__":
    unittest.main()
