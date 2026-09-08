"""
H2S Dosimeter Computer Vision Package
Provides automatic 3-block detection, perspective rectification, and ROI extraction.
"""

from .models import (
    BlockDetectionResult,
    ROICrops,
    SwatchData,
    CardGeometryConfig,
    Point2D,
    BoundingBox,
)
from .detector import DosimeterBlockDetector
from .quality import (
    DosimeterQualityGate,
    QualityReport,
    QualityCategory,
)

__all__ = [
    "DosimeterBlockDetector",
    "DosimeterQualityGate",
    "QualityReport",
    "QualityCategory",
    "BlockDetectionResult",
    "ROICrops",
    "SwatchData",
    "CardGeometryConfig",
    "Point2D",
    "BoundingBox",
]
