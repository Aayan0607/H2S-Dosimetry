"""
OpenCV Automatic 3-Block Detection & Perspective Rectification for H2S Dosimeter Band.
"""

from typing import Optional, Tuple, List, Dict, Any
import json
import numpy as np
import cv2

from .models import (
    CardGeometryConfig,
    BlockDetectionResult,
    ROICrops,
    SwatchData,
    BoundingBox,
)
from .utils import (
    order_quad_points,
    warp_quadrilateral,
    rotate_image,
    apply_margin_inset,
    compute_patch_statistics,
    draw_styled_box,
)


class DosimeterBlockDetector:
    """
    Modular, production-ready computer vision detector for H2S Dosimeter Bands.
    Locates, rectifies, and segments:
      - Block 1: QR Matrix Code (Fiducial & Metadata Anchor)
      - Block 2: Optical Reference Palette (7-Swatch Calibration Bar)
      - Block 3: Active Cu-Reagent Strip & Protected Baseline Patch
    """

    def __init__(self, config: Optional[CardGeometryConfig] = None):
        self.config = config or CardGeometryConfig()
        self.qr_detector = cv2.QRCodeDetector()

    def detect_and_rectify(self, image: np.ndarray) -> BlockDetectionResult:
        """
        Main processing pipeline:
        1. Preprocesses image and detects 4 badge corners via contour or QR fiducial.
        2. Warps badge into canonical 1000x400 perspective.
        3. Disambiguates and corrects rotational orientation (0°, 90°, 180°, 270°).
        4. Segments ROIs and extracts eroded color swatch statistics.
        5. Generates annotated diagnostic overlay.
        """
        if image is None or image.size == 0:
            raise ValueError("Input image is empty or None")

        # Ensure 3-channel BGR
        img_bgr = self._ensure_bgr(image)
        h, w = img_bgr.shape[:2]

        # Stage 1: Detect badge corners
        corners, method, confidence = self._locate_badge_corners(img_bgr)

        rotation_deg = 0
        if corners is not None:
            # Warp into standard canonical resolution
            warped, _ = warp_quadrilateral(
                img_bgr,
                corners,
                self.config.canonical_width,
                self.config.canonical_height
            )
            # Check and fix orientation (QR code must be on the left)
            warped, rotation_deg = self._disambiguate_orientation(warped)
            success = True
            status_msg = f"Successfully rectified using {method}"
        else:
            # Fallback if detection failed completely: resize full image
            warped = cv2.resize(
                img_bgr,
                (self.config.canonical_width, self.config.canonical_height),
                interpolation=cv2.INTER_LINEAR
            )
            warped, rotation_deg = self._disambiguate_orientation(warped)
            method = "fallback_resize"
            confidence = 0.2
            success = False
            status_msg = "Could not locate badge corners with high confidence; using fallback frame"

        # Stage 2: Sub-ROI Extraction
        cw, ch = self.config.canonical_width, self.config.canonical_height
        qr_box = self.config.qr_roi.to_pixels(cw, ch)
        ref_box = self.config.ref_bar_roi.to_pixels(cw, ch)
        strip_box = self.config.sensor_strip_roi.to_pixels(cw, ch)
        ctrl_box = self.config.control_patch_roi.to_pixels(cw, ch)

        crop_qr = self._safe_crop(warped, qr_box)
        crop_ref = self._safe_crop(warped, ref_box)
        crop_strip = self._safe_crop(warped, strip_box)
        crop_ctrl = self._safe_crop(warped, ctrl_box)

        # Stage 3: QR Code Payload Decoding
        qr_data, qr_payload = self._decode_qr_payload(warped, crop_qr)

        # Stage 4: Optical Reference Palette (Block 2) Swatch Segmentation
        swatches = self._segment_reference_swatches(warped, ref_box)

        # Stage 5: Diagnostics & Annotation Overlay
        annotated = self._create_annotated_visualization(
            warped=warped,
            qr_box=qr_box,
            ref_box=ref_box,
            strip_box=strip_box,
            ctrl_box=ctrl_box,
            swatches=swatches,
            qr_data=qr_data,
            method=method,
            confidence=confidence
        )

        roi_crops = {
            "qr": crop_qr,
            "reference_bar": crop_ref,
            "sensor_strip": crop_strip,
            "control_patch": crop_ctrl,
        }

        corners_list = [tuple(pt) for pt in corners] if corners is not None else None

        return BlockDetectionResult(
            success=success,
            rectified_badge=warped,
            qr_data=qr_data,
            qr_payload=qr_payload,
            roi_crops=roi_crops,
            swatches=swatches,
            annotated_image=annotated,
            status_message=status_msg,
            rotation_applied_deg=rotation_deg,
            detection_method=method,
            card_corners=corners_list,
            confidence_score=confidence
        )

    # -------------------------------------------------------------------------
    # Corner Detection Strategies
    # -------------------------------------------------------------------------

    def _locate_badge_corners(
        self,
        image: np.ndarray
    ) -> Tuple[Optional[np.ndarray], str, float]:
        """
        Attempts badge corner detection using:
        1. Contour / edge polygon approximation.
        2. QR-code anchor homography inversion if background is cluttered.
        """
        # Fast-path: Check if image is already canonical badge dimensions (e.g. pre-cropped badge)
        h, w = image.shape[:2]
        cw, ch = self.config.canonical_width, self.config.canonical_height
        if (w == cw and h == ch) or (w == ch and h == cw):
            corners = np.array([
                [0.0, 0.0],
                [float(w - 1), 0.0],
                [float(w - 1), float(h - 1)],
                [0.0, float(h - 1)]
            ], dtype=np.float32)
            return corners, "canonical_direct", 1.0

        # Primary: Contour analysis
        contour_corners, conf = self._detect_badge_contour(image)
        if contour_corners is not None and conf >= 0.60:
            return contour_corners, "contour_quad", conf

        # Secondary fallback: QR fiducial anchor
        qr_corners, qr_conf = self._detect_badge_from_qr_fiducial(image)
        if qr_corners is not None:
            return qr_corners, "qr_fiducial_fallback", qr_conf

        # If contour found something with lower confidence, still use it
        if contour_corners is not None:
            return contour_corners, "contour_quad_low_conf", conf

        return None, "detection_failed", 0.0

    def _detect_badge_contour(
        self,
        image: np.ndarray
    ) -> Tuple[Optional[np.ndarray], float]:
        """
        Detects 4 outer corners of the rectangular badge using adaptive edge detection.
        """
        h, w = image.shape[:2]
        total_area = w * h

        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        blurred = cv2.bilateralFilter(gray, d=9, sigmaColor=75, sigmaSpace=75)

        # Try multiple thresholding passes for robustness across lighting
        edge_maps = []

        # Pass 1: Canny with Otsu upper bound
        high_thresh, _ = cv2.threshold(blurred, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        low_thresh = 0.5 * high_thresh
        edges_canny = cv2.Canny(blurred, low_thresh, high_thresh)
        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5))
        closed_canny = cv2.morphologyEx(edges_canny, cv2.MORPH_CLOSE, kernel)
        edge_maps.append(closed_canny)

        # Pass 2: Adaptive Thresholding
        adapt = cv2.adaptiveThreshold(
            blurred, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 15, 3
        )
        edge_maps.append(cv2.morphologyEx(adapt, cv2.MORPH_CLOSE, kernel))

        best_corners = None
        best_score = 0.0

        for edge_map in edge_maps:
            contours, _ = cv2.findContours(edge_map, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            contours = sorted(contours, key=cv2.contourArea, reverse=True)[:8]

            for c in contours:
                area = cv2.contourArea(c)
                if area < 0.03 * total_area:
                    continue

                peri = cv2.arcLength(c, True)
                approx = cv2.approxPolyDP(c, 0.02 * peri, True)

                if len(approx) == 4 and cv2.isContourConvex(approx):
                    pts = approx.reshape(4, 2).astype(np.float32)

                    # Check aspect ratio
                    rect = cv2.minAreaRect(approx)
                    rw, rh = rect[1]
                    if rw == 0 or rh == 0:
                        continue
                    aspect = max(rw, rh) / min(rw, rh)

                    # The canonical badge has aspect ratio 1000/400 = 2.5
                    # Target aspect ratio range: 1.8 to 3.2
                    if 1.6 <= aspect <= 3.4:
                        aspect_fit = 1.0 - abs(aspect - 2.5) / 2.5
                        area_score = min(1.0, area / (0.6 * total_area))
                        score = 0.6 * aspect_fit + 0.4 * area_score

                        if score > best_score:
                            best_score = score
                            best_corners = pts

        return best_corners, float(best_score)

    def _detect_badge_from_qr_fiducial(
        self,
        image: np.ndarray
    ) -> Tuple[Optional[np.ndarray], float]:
        """
        Fiducial fallback: Uses detected QR code corners to extrapolate
        the 4 outer corners of the full badge via known relative homography.
        """
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        decoded_text, points = self.qr_detector.detect(gray)

        if points is None or len(points) == 0:
            return None, 0.0

        qr_pts = points[0].astype(np.float32)
        if len(qr_pts) != 4:
            return None, 0.0

        ordered_qr = order_quad_points(qr_pts)

        # Expected canonical pixel coordinates of QR code
        cw, ch = self.config.canonical_width, self.config.canonical_height
        qx, qy, qw, qh = self.config.qr_roi.to_pixels(cw, ch)

        canonical_qr_corners = np.array([
            [float(qx), float(qy)],
            [float(qx + qw), float(qy)],
            [float(qx + qw), float(qy + qh)],
            [float(qx), float(qy + qh)]
        ], dtype=np.float32)

        # Homography from canonical badge coords -> camera image
        h_matrix, _ = cv2.findHomography(canonical_qr_corners, ordered_qr)
        if h_matrix is None:
            return None, 0.0

        # Canonical badge 4 corners
        canonical_badge_corners = np.array([
            [[0.0, 0.0]],
            [[float(cw), 0.0]],
            [[float(cw), float(ch)]],
            [[0.0, float(ch)]]
        ], dtype=np.float32)

        # Project canonical badge corners into camera frame
        projected_badge_corners = cv2.perspectiveTransform(canonical_badge_corners, h_matrix)
        corners = projected_badge_corners.reshape(4, 2)

        return corners, 0.85

    # -------------------------------------------------------------------------
    # Orientation Disambiguation
    # -------------------------------------------------------------------------

    def _disambiguate_orientation(
        self,
        warped_badge: np.ndarray
    ) -> Tuple[np.ndarray, int]:
        """
        Resolves rotational ambiguity (0°, 90°, 180°, 270°).
        In canonical orientation, Block 1 (QR Code) must reside on the LEFT side (x < 0.5).
        """
        h, w = warped_badge.shape[:2]

        # 1. If badge was warped upright (w > h), check if it's 180° inverted
        if w >= h:
            is_inverted = self._is_qr_on_right(warped_badge)
            if is_inverted:
                rotated = rotate_image(warped_badge, 180)
                return rotated, 180
            return warped_badge, 0

        # 2. If badge was warped vertically (h > w), rotate 90° or 270°
        # First test 90° clockwise
        test_90 = rotate_image(warped_badge, 90)
        if not self._is_qr_on_right(test_90):
            return test_90, 90
        # Otherwise 270°
        test_270 = rotate_image(warped_badge, 270)
        return test_270, 270

    def _is_qr_on_right(self, image_1000x400: np.ndarray) -> bool:
        """
        Checks whether QR code is located on the right half (x > 0.5).
        Uses both cv2.QRCodeDetector and edge/gradient density comparison.
        """
        h, w = image_1000x400.shape[:2]
        gray = cv2.cvtColor(image_1000x400, cv2.COLOR_BGR2GRAY)

        # Check QR detector
        _, points = self.qr_detector.detect(gray)
        if points is not None and len(points) > 0:
            qr_center_x = float(np.mean(points[0][:, 0]))
            return qr_center_x > (w * 0.5)

        # Fallback: QR codes have dense high-frequency gradient transitions
        left_half = gray[:, :int(w * 0.45)]
        right_half = gray[:, int(w * 0.55):]

        left_grad = cv2.Laplacian(left_half, cv2.CV_64F).var()
        right_grad = cv2.Laplacian(right_half, cv2.CV_64F).var()

        # If right side has significantly higher gradient variance, it's likely inverted
        return right_grad > 1.35 * left_grad

    # -------------------------------------------------------------------------
    # QR Decoding & Swatch Segmentation
    # -------------------------------------------------------------------------

    def _decode_qr_payload(
        self,
        full_warped: np.ndarray,
        crop_qr: np.ndarray
    ) -> Tuple[Optional[str], Optional[Dict[str, Any]]]:
        """
        Attempts to decode QR code string payload and parse JSON metadata.
        """
        # Try full warped first, then crop
        for img in [crop_qr, full_warped]:
            gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
            decoded_text, _, _ = self.qr_detector.detectAndDecode(gray)
            if decoded_text:
                payload_dict = None
                try:
                    payload_dict = json.loads(decoded_text)
                except Exception:
                    pass
                return decoded_text, payload_dict

        return None, None

    def _segment_reference_swatches(
        self,
        warped: np.ndarray,
        ref_box: Tuple[int, int, int, int]
    ) -> List[SwatchData]:
        """
        Segments the 7 calibration swatches of Block 2, applying margin erosion
        to avoid border line artifacts and color bleed.
        """
        rx, ry, rw, rh = ref_box
        names = self.config.swatch_names
        n = len(names)
        swatch_w = rw / float(n)

        swatches = []
        for i, name in enumerate(names):
            sx = int(round(rx + i * swatch_w))
            sy = ry
            sw = int(round(swatch_w))
            sh = rh

            swatch_box = (sx, sy, sw, sh)
            raw_crop = self._safe_crop(warped, swatch_box)

            # Apply internal margin inset (erosion)
            eroded_box = apply_margin_inset(
                swatch_box,
                erosion_ratio_x=self.config.swatch_erosion_ratio,
                erosion_ratio_y=self.config.swatch_erosion_ratio
            )
            eroded_crop = self._safe_crop(warped, eroded_box)

            stats = compute_patch_statistics(eroded_crop)
            mean_bgr, mean_rgb, mean_lab, median_rgb, median_lab, std_rgb = stats

            swatches.append(SwatchData(
                name=name,
                index=i,
                bbox=swatch_box,
                crop=raw_crop,
                eroded_crop=eroded_crop,
                mean_bgr=mean_bgr,
                mean_rgb=mean_rgb,
                mean_lab=mean_lab,
                median_rgb=median_rgb,
                median_lab=median_lab,
                std_rgb=std_rgb
            ))

        return swatches

    # -------------------------------------------------------------------------
    # Visualization & Diagnostic Overlay
    # -------------------------------------------------------------------------

    def _create_annotated_visualization(
        self,
        warped: np.ndarray,
        qr_box: Tuple[int, int, int, int],
        ref_box: Tuple[int, int, int, int],
        strip_box: Tuple[int, int, int, int],
        ctrl_box: Tuple[int, int, int, int],
        swatches: List[SwatchData],
        qr_data: Optional[str],
        method: str,
        confidence: float
    ) -> np.ndarray:
        """
        Creates a color-coded diagnostic overlay showing all 3 functional blocks,
        eroded swatch extraction cells, and status banner.
        """
        canvas = warped.copy()

        # Block 1 (QR): Cyan
        draw_styled_box(canvas, qr_box, "BLOCK 1: QR FIDUCIAL", (255, 200, 0), thickness=2)

        # Block 2 (Reference Palette): Amber
        draw_styled_box(canvas, ref_box, "BLOCK 2: OPTICAL REF", (0, 165, 255), thickness=2)

        # Swatch insets inside Block 2
        for sw in swatches:
            ex, ey, ew, eh = apply_margin_inset(
                sw.bbox,
                erosion_ratio_x=self.config.swatch_erosion_ratio,
                erosion_ratio_y=self.config.swatch_erosion_ratio
            )
            # Highlight eroded sampling core
            cv2.rectangle(canvas, (ex, ey), (ex + ew, ey + eh), (0, 255, 255), 1)

        # Block 3: Sensor Strip (Magenta) and Control Patch (Green)
        draw_styled_box(canvas, strip_box, "BLOCK 3: ACTIVE REAGENT", (255, 0, 255), thickness=2)
        draw_styled_box(canvas, ctrl_box, "CTRL", (0, 220, 0), thickness=2)

        # Top diagnostic status bar
        bar_h = 28
        bar = np.zeros((bar_h, canvas.shape[1], 3), dtype=np.uint8)
        bar[:] = (35, 38, 42)

        # Status text
        font = cv2.FONT_HERSHEY_SIMPLEX
        status_txt = f"H2S DOSIMETER | METHOD: {method} | CONF: {confidence:.2f} | QR: {qr_data or 'DETECTED'}"
        cv2.putText(bar, status_txt, (14, 19), font, 0.45, (0, 255, 200), 1, cv2.LINE_AA)

        return np.vstack([bar, canvas])

    # -------------------------------------------------------------------------
    # Helper Methods
    # -------------------------------------------------------------------------

    @staticmethod
    def _ensure_bgr(image: np.ndarray) -> np.ndarray:
        if image.ndim == 2:
            return cv2.cvtColor(image, cv2.COLOR_GRAY2BGR)
        elif image.shape[2] == 4:
            return cv2.cvtColor(image, cv2.COLOR_BGRA2BGR)
        return image

    @staticmethod
    def _safe_crop(image: np.ndarray, bbox: Tuple[int, int, int, int]) -> np.ndarray:
        x, y, w, h = bbox
        ih, iw = image.shape[:2]
        x1 = max(0, min(iw, x))
        y1 = max(0, min(ih, y))
        x2 = max(0, min(iw, x + w))
        y2 = max(0, min(ih, y + h))
        if x2 <= x1 or y2 <= y1:
            return np.zeros((1, 1, 3), dtype=image.dtype)
        return image[y1:y2, x1:x2].copy()
