"""
Data models and configuration definitions for DosimeterBlockDetector.
"""

from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple, Any
import numpy as np


@dataclass
class Point2D:
    x: float
    y: float


@dataclass
class BoundingBox:
    """Normalized relative bounding box coordinates [0.0 - 1.0]."""
    x_min: float
    y_min: float
    x_max: float
    y_max: float

    def to_pixels(self, img_w: int, img_h: int) -> Tuple[int, int, int, int]:
        """Convert normalized coordinates to integer (x, y, w, h)."""
        x = int(round(self.x_min * img_w))
        y = int(round(self.y_min * img_h))
        w = int(round((self.x_max - self.x_min) * img_w))
        h = int(round((self.y_max - self.y_min) * img_h))
        # Ensure non-negative and valid bounds
        x = max(0, min(img_w - 1, x))
        y = max(0, min(img_h - 1, y))
        w = max(1, min(img_w - x, w))
        h = max(1, min(img_h - y, h))
        return x, y, w, h


@dataclass
class CardGeometryConfig:
    """Canonical geometric specifications for the H2S dosimeter card/badge."""
    canonical_width: int = 1000
    canonical_height: int = 400

    # Relative normalized ROIs on rectified canvas
    # Block 1: QR Code
    qr_roi: BoundingBox = field(default_factory=lambda: BoundingBox(0.04, 0.20, 0.28, 0.80))

    # Block 2: Optical Reference Palette (7-swatch calibration bar)
    ref_bar_roi: BoundingBox = field(default_factory=lambda: BoundingBox(0.32, 0.22, 0.62, 0.78))

    # Block 3: Sensing Region (Active Strip + Protected Baseline Patch)
    sensor_strip_roi: BoundingBox = field(default_factory=lambda: BoundingBox(0.67, 0.20, 0.86, 0.80))
    control_patch_roi: BoundingBox = field(default_factory=lambda: BoundingBox(0.89, 0.25, 0.95, 0.75))

    # Palette swatch configuration
    swatch_names: List[str] = field(default_factory=lambda: [
        "White",
        "50% Gray",
        "Black",
        "Red",
        "Green",
        "Blue",
        "Yellow"
    ])

    # Reference nominal sRGB colors for validation / ground-truth
    nominal_swatch_srgb: Dict[str, Tuple[int, int, int]] = field(default_factory=lambda: {
        "White": (245, 245, 245),
        "50% Gray": (128, 128, 128),
        "Black": (28, 28, 28),
        "Red": (215, 45, 45),
        "Green": (45, 175, 60),
        "Blue": (40, 80, 215),
        "Yellow": (235, 215, 40)
    })

    # Erosion ratio applied to each swatch cell (fraction of width and height)
    # to eliminate boundary bleed and card border lines.
    swatch_erosion_ratio: float = 0.18


@dataclass
class SwatchData:
    """Extracted metrics for a single reference color swatch."""
    name: str
    index: int
    bbox: Tuple[int, int, int, int]  # (x, y, w, h) in rectified frame
    crop: np.ndarray                 # Raw BGR cropped patch
    eroded_crop: np.ndarray          # Inset BGR cropped patch without borders
    mean_bgr: Tuple[float, float, float]
    mean_rgb: Tuple[float, float, float]
    mean_lab: Tuple[float, float, float]
    median_rgb: Tuple[float, float, float]
    median_lab: Tuple[float, float, float]
    std_rgb: Tuple[float, float, float]

    def to_dict(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "index": self.index,
            "bbox": self.bbox,
            "mean_bgr": self.mean_bgr,
            "mean_rgb": self.mean_rgb,
            "mean_lab": self.mean_lab,
            "median_rgb": self.median_rgb,
            "median_lab": self.median_lab,
            "std_rgb": self.std_rgb,
        }


@dataclass
class ROICrops:
    """Image crops of the functional zones."""
    qr: np.ndarray
    reference_bar: np.ndarray
    sensor_strip: np.ndarray
    control_patch: np.ndarray

    def to_dict(self) -> Dict[str, np.ndarray]:
        return {
            "qr": self.qr,
            "reference_bar": self.reference_bar,
            "sensor_strip": self.sensor_strip,
            "control_patch": self.control_patch,
        }


@dataclass
class BlockDetectionResult:
    """Complete output produced by DosimeterBlockDetector."""
    success: bool
    rectified_badge: np.ndarray
    qr_data: Optional[str]
    qr_payload: Optional[Dict[str, Any]]
    roi_crops: Dict[str, np.ndarray]
    swatches: List[SwatchData]
    annotated_image: np.ndarray
    status_message: str
    rotation_applied_deg: int = 0
    detection_method: str = "unknown"
    card_corners: Optional[List[Tuple[float, float]]] = None
    confidence_score: float = 0.0
