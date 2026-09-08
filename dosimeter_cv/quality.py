"""
Dynamic & Model-Based Image Quality Gating for H2S Wristband Scans.
===================================================================
Production-grade Image Quality Assessment (IQA) engine enforcing strict,
dynamic quality gating for field captures in refineries, plants, and mines.
"""

from dataclasses import dataclass, field
from enum import Enum
from typing import Dict, List, Optional, Tuple, Union, Any
import numpy as np
import cv2


class QualityCategory(str, Enum):
    VALID_SCAN = "VALID_SCAN"
    OUT_OF_FOCUS = "OUT_OF_FOCUS"
    GLARE_PRESENT = "GLARE_PRESENT"
    OCCLUDED_OR_DIRTY = "OCCLUDED_OR_DIRTY"
    EXPIRED_OR_DAMAGED = "EXPIRED_OR_DAMAGED"


@dataclass
class QualityReport:
    """Standardized output produced by DosimeterQualityGate."""
    is_valid: bool
    quality_score: float
    actionable_warnings: List[str] = field(default_factory=list)
    predicted_category: QualityCategory = QualityCategory.VALID_SCAN
    category_confidences: Dict[str, float] = field(default_factory=dict)
    metrics: Dict[str, float] = field(default_factory=dict)


class DosimeterQualityGate:
    """
    Dynamic, multi-factor Image Quality Assessment (IQA) engine using OpenCV,
    NumPy, and edge AI concepts (MobileNet/TFLite compatible).
    """

    def __init__(self, tflite_model_path: Optional[str] = None):
        self.tflite_model_path = tflite_model_path
        self._interpreter = None
        if tflite_model_path:
            self._load_tflite_model(tflite_model_path)

    def evaluate(
        self,
        image_bgr: np.ndarray,
        badge_corners: Optional[np.ndarray] = None,
        rectified_badge: Optional[np.ndarray] = None,
        sensor_roi: Optional[Tuple[int, int, int, int]] = None,
        ref_roi: Optional[Tuple[int, int, int, int]] = None
    ) -> QualityReport:
        """
        Runs comprehensive multi-factor quality gating:
        1. Dynamic megapixel & edge-density blur evaluation.
        2. Localized specular glare assessment on critical sensing & reference blocks.
        3. Exposure and quadrant shadow uniformity.
        4. Perspective tilt & acute angle distortion.
        5. Lightweight MobileNet/TFLite classification.
        """
        if image_bgr is None or image_bgr.size == 0:
            return QualityReport(
                is_valid=False,
                quality_score=0.0,
                actionable_warnings=["IMAGE_CORRUPT: Empty or invalid image buffer."],
                predicted_category=QualityCategory.OCCLUDED_OR_DIRTY,
                metrics={"raw_sharpness": 0.0}
            )

        warnings: List[str] = []
        metrics: Dict[str, float] = {}

        # ---------------------------------------------------------------------
        # 1. DYNAMIC BLUR ASSESSMENT
        # ---------------------------------------------------------------------
        raw_sharpness, blur_thresh, blur_score, is_blurry = self._assess_dynamic_blur(image_bgr)
        metrics["raw_sharpness"] = round(raw_sharpness, 2)
        metrics["blur_threshold"] = round(blur_thresh, 2)
        metrics["blur_score"] = round(blur_score, 1)

        if is_blurry:
            warnings.append("BLUR DETECTED: Hold phone steady and tap the badge to autofocus")

        # ---------------------------------------------------------------------
        # 2. SPECULAR GLARE ON SENSOR STRIP & REFERENCE BAR
        # ---------------------------------------------------------------------
        # If no rectified badge supplied, use full image or default ROIs
        analysis_badge = rectified_badge if rectified_badge is not None else image_bgr
        bh, bw = analysis_badge.shape[:2]

        # Default CAD ROIs if not supplied (based on 1000x400 standard layout)
        s_roi = sensor_roi or (int(bw * 0.64), int(bh * 0.18), int(bw * 0.28), int(bh * 0.64))
        r_roi = ref_roi or (int(bw * 0.32), int(bh * 0.18), int(bw * 0.28), int(bh * 0.64))

        glare_sensor_pct, glare_ref_pct, has_critical_glare = self._detect_specular_glare(
            analysis_badge, s_roi, r_roi
        )
        metrics["glare_sensor_pct"] = round(glare_sensor_pct, 2)
        metrics["glare_ref_pct"] = round(glare_ref_pct, 2)

        if has_critical_glare:
            warnings.append("GLARE ON SENSOR: Tilt phone 10-15 degrees away from overhead lights to remove glare")

        # ---------------------------------------------------------------------
        # 3. EXPOSURE & QUADRANT SHADOW UNIFORMITY
        # ---------------------------------------------------------------------
        mean_lum, delta_l, is_underexposed, is_overexposed, is_shadowed = self._evaluate_exposure_and_shadows(
            analysis_badge
        )
        metrics["mean_luminance"] = round(mean_lum, 1)
        metrics["quadrant_delta_l"] = round(delta_l, 1)

        if is_underexposed:
            warnings.append("UNDEREXPOSURE: Move to a brighter area or turn on phone flash")
        elif is_overexposed:
            warnings.append("OVEREXPOSURE: Shield from direct harsh sun or flash wash-out")

        if is_shadowed:
            warnings.append("SHADOW DETECTED: Move to evenly lit area or use phone flash")

        # ---------------------------------------------------------------------
        # 4. PERSPECTIVE TILT / SKEW PENALTY
        # ---------------------------------------------------------------------
        tilt_angle_deg, is_excessive_tilt = self._calculate_perspective_tilt(
            badge_corners, image_bgr.shape[:2]
        )
        metrics["tilt_angle_deg"] = round(tilt_angle_deg, 1)

        if is_excessive_tilt:
            warnings.append("TILT DETECTED: Hold smartphone parallel to the wristband")

        # ---------------------------------------------------------------------
        # 5. MODEL-BASED LIGHTWEIGHT CLASSIFICATION (MobileNet / TFLite Hook)
        # ---------------------------------------------------------------------
        top_cat, confidences = self._classify_scan_quality(
            analysis_badge, is_blurry, has_critical_glare, mean_lum, is_shadowed
        )

        # ---------------------------------------------------------------------
        # 6. QUALITY DECISION MODEL & SCORE AGGREGATION
        # ---------------------------------------------------------------------
        overall_score = self._compute_overall_quality(
            blur_score=blur_score,
            glare_sensor_pct=glare_sensor_pct,
            mean_lum=mean_lum,
            delta_l=delta_l,
            tilt_angle_deg=tilt_angle_deg,
            top_category=top_cat
        )

        # Gating: Must score >= 70, have <= 2.5% glare on sensor, and not have severe blur
        is_valid = bool(
            overall_score >= 70.0 and
            not has_critical_glare and
            raw_sharpness >= (0.6 * blur_thresh) and
            not is_underexposed
        )

        return QualityReport(
            is_valid=is_valid,
            quality_score=round(overall_score, 1),
            actionable_warnings=warnings,
            predicted_category=top_cat,
            category_confidences=confidences,
            metrics=metrics
        )

    # -------------------------------------------------------------------------
    # SUB-MODULE 1: DYNAMIC BLUR ASSESSMENT
    # -------------------------------------------------------------------------

    def _assess_dynamic_blur(self, image_bgr: np.ndarray) -> Tuple[float, float, float, bool]:
        """
        Adaptive blur scoring:
        Threshold scales with Megapixels (MP) and high-frequency edge density.
        """
        h, w = image_bgr.shape[:2]
        mp = (w * h) / 1e6

        gray = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2GRAY)
        lap_var = float(cv2.Laplacian(gray, cv2.CV_64F).var())

        # High-frequency edge density ratio via Sobel filter
        sobel_x = cv2.Sobel(gray, cv2.CV_32F, 1, 0, ksize=3)
        sobel_y = cv2.Sobel(gray, cv2.CV_32F, 0, 1, ksize=3)
        edge_mag = np.abs(sobel_x) + np.abs(sobel_y)
        edge_density = float(np.count_nonzero(edge_mag > 45.0) / float(w * h))

        # Dynamic baseline threshold
        # Sharp high-frequency textures (like QR codes & text) raise expected variance
        edge_factor = max(0.6, min(1.6, 0.8 + 2.5 * edge_density))
        blur_thresh = 75.0 * (1.0 + 0.15 * mp) * edge_factor

        is_blurry = lap_var < blur_thresh
        blur_score = min(100.0, (lap_var / max(1.0, blur_thresh)) * 80.0)

        return lap_var, blur_thresh, blur_score, is_blurry

    # -------------------------------------------------------------------------
    # SUB-MODULE 2: SPECULAR GLARE DETECTION ON CHEMICAL STRIP
    # -------------------------------------------------------------------------

    def _detect_specular_glare(
        self,
        badge_bgr: np.ndarray,
        sensor_box: Tuple[int, int, int, int],
        ref_box: Tuple[int, int, int, int]
    ) -> Tuple[float, float, bool]:
        """
        Detects specular highlights (V > 246 and S < 25 or L* > 250) specifically
        over the critical sensing strip and optical reference bar.
        Validates texture loss (local variance < 4.0) to prevent diffuse white paper
        from triggering false positives.
        """
        def measure_patch_glare(box: Tuple[int, int, int, int]) -> float:
            x, y, w, h = box
            ih, iw = badge_bgr.shape[:2]
            x1, y1 = max(0, x), max(0, y)
            x2, y2 = min(iw, x + w), min(ih, y + h)
            if x2 <= x1 or y2 <= y1:
                return 0.0

            patch = badge_bgr[y1:y2, x1:x2]
            hsv = cv2.cvtColor(patch, cv2.COLOR_BGR2HSV)
            lab = cv2.cvtColor(patch, cv2.COLOR_BGR2Lab)
            gray = cv2.cvtColor(patch, cv2.COLOR_BGR2GRAY)

            # Highlight condition: V > 246 & S < 25, or OpenCV Lab L* > 250
            clipped = (
                ((hsv[:, :, 2] > 246) & (hsv[:, :, 1] < 25)) |
                (lab[:, :, 0] > 250) |
                ((patch[:, :, 0] >= 252) & (patch[:, :, 1] >= 252) & (patch[:, :, 2] >= 252))
            )

            # Local texture collapse check (specular reflection has no paper fiber texture)
            mean = cv2.blur(gray.astype(np.float32), (5, 5))
            mean_sq = cv2.blur(gray.astype(np.float32) ** 2, (5, 5))
            local_var = np.maximum(0.0, mean_sq - (mean ** 2))
            texture_loss = local_var < 4.0

            true_glare = clipped & texture_loss
            glare_count = np.count_nonzero(true_glare)
            total = patch.shape[0] * patch.shape[1]
            return float((glare_count / float(max(1, total))) * 100.0)

        glare_sensor_pct = measure_patch_glare(sensor_box)
        glare_ref_pct = measure_patch_glare(ref_box)

        # Trigger if glare covers > 2.5% of the sensor strip area
        has_critical_glare = glare_sensor_pct > 2.5

        return glare_sensor_pct, glare_ref_pct, has_critical_glare

    # -------------------------------------------------------------------------
    # SUB-MODULE 3: DYNAMIC EXPOSURE & SHADOW UNIFORMITY
    # -------------------------------------------------------------------------

    def _evaluate_exposure_and_shadows(
        self,
        badge_bgr: np.ndarray
    ) -> Tuple[float, float, bool, bool, bool]:
        """
        Measures overall luminance distribution and quadrant shadow uniformity.
        """
        lab = cv2.cvtColor(badge_bgr, cv2.COLOR_BGR2Lab)
        l_channel = lab[:, :, 0].astype(np.float32)
        mean_lum = float(np.mean(l_channel))
        is_underexposed = mean_lum < 50.0
        clip_pct = float(np.count_nonzero(l_channel >= 250)) / float(max(1, l_channel.size)) * 100.0
        is_overexposed = (mean_lum > 210.0) or (clip_pct > 20.0)

        # Quadrant luminance variance
        h, w = l_channel.shape
        mid_x, mid_y = w // 2, h // 2
        q1 = np.mean(l_channel[:mid_y, :mid_x])
        q2 = np.mean(l_channel[:mid_y, mid_x:])
        q3 = np.mean(l_channel[mid_y:, :mid_x])
        q4 = np.mean(l_channel[mid_y:, mid_x:])
        delta_l = float(max(q1, q2, q3, q4) - min(q1, q2, q3, q4))

        is_shadowed = delta_l > 35.0

        return mean_lum, delta_l, is_underexposed, is_overexposed, is_shadowed

    # -------------------------------------------------------------------------
    # SUB-MODULE 4: PERSPECTIVE TILT / SKEW CALCULATION
    # -------------------------------------------------------------------------

    def _calculate_perspective_tilt(
        self,
        corners: Optional[np.ndarray],
        image_shape: Tuple[int, int]
    ) -> Tuple[float, bool]:
        """
        Measures perspective distortion by analyzing acute corner angles of the homography quad.
        In a canonical parallel capture, all corners equal 90 degrees.
        """
        if corners is None or len(corners) != 4:
            return 0.0, False

        pts = np.asarray(corners, dtype=np.float32).reshape(4, 2)

        # Vectors along the 4 edges
        v0 = pts[1] - pts[0]
        v1 = pts[2] - pts[1]
        v2 = pts[3] - pts[2]
        v3 = pts[0] - pts[3]

        def angle_between(u, v):
            norm_prod = (np.linalg.norm(u) * np.linalg.norm(v))
            if norm_prod < 1e-4:
                return 90.0
            cos_theta = np.clip(np.dot(u, v) / norm_prod, -1.0, 1.0)
            return np.degrees(np.arccos(cos_theta))

        # Internal corner angles
        angles = [
            angle_between(v0, -v3),
            angle_between(v1, -v0),
            angle_between(v2, -v1),
            angle_between(v3, -v2)
        ]

        max_angular_skew = max(abs(90.0 - a) for a in angles)

        # Aspect ratio distortion
        w_top = np.linalg.norm(v0)
        w_bot = np.linalg.norm(v2)
        h_left = np.linalg.norm(v3)
        h_right = np.linalg.norm(v1)
        mean_w = (w_top + w_bot) / 2.0
        mean_h = (h_left + h_right) / 2.0

        aspect = mean_w / max(1.0, mean_h)
        aspect_skew = abs(aspect - 2.5) / 2.5 * 45.0

        tilt_angle = float(max(max_angular_skew, aspect_skew))
        is_excessive = tilt_angle > 25.0

        return tilt_angle, is_excessive

    # -------------------------------------------------------------------------
    # SUB-MODULE 5: MODEL-BASED LIGHTWEIGHT CLASSIFICATION
    # -------------------------------------------------------------------------

    def _classify_scan_quality(
        self,
        badge_bgr: np.ndarray,
        is_blurry: bool,
        has_glare: bool,
        mean_lum: float,
        is_shadowed: bool
    ) -> Tuple[QualityCategory, Dict[str, float]]:
        """
        Lightweight classification compatible with MobileNetV2 / TFLite.
        Normalizes input to standard 224x224x3 with [-1, 1] range.
        Outputs confidence distribution across:
        ['VALID_SCAN', 'OUT_OF_FOCUS', 'GLARE_PRESENT', 'OCCLUDED_OR_DIRTY', 'EXPIRED_OR_DAMAGED']
        """
        # Standard MobileNetV2 input preprocessing
        mobilenet_input = cv2.resize(badge_bgr, (224, 224), interpolation=cv2.INTER_LINEAR)
        mobilenet_input = (mobilenet_input.astype(np.float32) / 127.5) - 1.0

        # If a TFLite model is provided on-device, execute inference
        if self._interpreter is not None:
            return self._run_tflite_inference(mobilenet_input)

        # Embedded edge heuristic classifier (mimics MobileNet feature extraction)
        p_blur = 0.85 if is_blurry else 0.05
        p_glare = 0.90 if has_glare else 0.04
        p_occluded = 0.65 if is_shadowed else 0.05
        p_expired = 0.70 if (mean_lum < 45 or mean_lum > 235) else 0.05

        if not is_blurry and not has_glare and not is_shadowed and 50 <= mean_lum <= 220:
            p_valid = 0.94
        else:
            p_valid = max(0.05, 1.0 - (p_blur + p_glare + p_occluded + p_expired))

        # Softmax normalization
        raw_scores = np.array([p_valid, p_blur, p_glare, p_occluded, p_expired], dtype=np.float32)
        exp_scores = np.exp(raw_scores * 2.5)
        probs = exp_scores / np.sum(exp_scores)

        categories = [
            QualityCategory.VALID_SCAN,
            QualityCategory.OUT_OF_FOCUS,
            QualityCategory.GLARE_PRESENT,
            QualityCategory.OCCLUDED_OR_DIRTY,
            QualityCategory.EXPIRED_OR_DAMAGED
        ]

        conf_dict = {cat.value: round(float(probs[i]), 4) for i, cat in enumerate(categories)}
        top_idx = int(np.argmax(probs))
        top_category = categories[top_idx]

        return top_category, conf_dict

    def _load_tflite_model(self, path: str):
        try:
            import tensorflow as tf
            self._interpreter = tf.lite.Interpreter(model_path=path)
            self._interpreter.allocate_tensors()
        except Exception:
            self._interpreter = None

    def _run_tflite_inference(self, preprocessed_input: np.ndarray):
        input_details = self._interpreter.get_input_details()
        output_details = self._interpreter.get_output_details()
        tensor = np.expand_dims(preprocessed_input, axis=0).astype(input_details[0]['dtype'])
        self._interpreter.set_tensor(input_details[0]['index'], tensor)
        self._interpreter.invoke()
        output_data = self._interpreter.get_tensor(output_details[0]['index'])[0]
        categories = [
            QualityCategory.VALID_SCAN,
            QualityCategory.OUT_OF_FOCUS,
            QualityCategory.GLARE_PRESENT,
            QualityCategory.OCCLUDED_OR_DIRTY,
            QualityCategory.EXPIRED_OR_DAMAGED
        ]
        probs = np.exp(output_data) / np.sum(np.exp(output_data))
        conf_dict = {cat.value: round(float(probs[i]), 4) for i, cat in enumerate(categories)}
        top_idx = int(np.argmax(probs))
        return categories[top_idx], conf_dict

    # -------------------------------------------------------------------------
    # SUB-MODULE 6: OVERALL QUALITY AGGREGATION
    # -------------------------------------------------------------------------

    def _compute_overall_quality(
        self,
        blur_score: float,
        glare_sensor_pct: float,
        mean_lum: float,
        delta_l: float,
        tilt_angle_deg: float,
        top_category: QualityCategory
    ) -> float:
        """
        Aggregates multi-factor signals into an overall Quality Score (0 to 100).
        """
        score = 100.0

        # Blur penalty (weighted heavily)
        score -= max(0.0, (80.0 - blur_score) * 0.5)

        # Glare penalty on sensor strip: 2.5% is boundary
        if glare_sensor_pct > 2.5:
            score -= min(35.0, (glare_sensor_pct - 2.5) * 8.0 + 15.0)

        # Exposure penalty
        if mean_lum < 50.0:
            score -= (50.0 - mean_lum) * 0.8
        elif mean_lum > 220.0:
            score -= (mean_lum - 220.0) * 0.8

        # Shadow delta penalty
        if delta_l > 35.0:
            score -= min(20.0, (delta_l - 35.0) * 0.6)

        # Perspective tilt penalty
        if tilt_angle_deg > 25.0:
            score -= min(15.0, (tilt_angle_deg - 25.0) * 0.5)

        # Model category prior
        if top_category != QualityCategory.VALID_SCAN:
            score -= 10.0

        return max(0.0, min(100.0, score))
