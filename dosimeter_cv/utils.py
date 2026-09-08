"""
Utility functions for geometry, perspective transforms, color spaces, and drawing.
"""

from typing import List, Tuple
import cv2
import numpy as np


def order_quad_points(pts: np.ndarray) -> np.ndarray:
    """
    Orders 4 arbitrary 2D corner points into standard canonical order:
    [top-left, top-right, bottom-right, bottom-left].

    Uses the sum and difference of coordinates:
      - Top-Left: smallest (x + y)
      - Bottom-Right: largest (x + y)
      - Top-Right: smallest (y - x) -> or largest (x - y)
      - Bottom-Left: largest (y - x) -> or smallest (x - y)
    """
    pts = np.asarray(pts, dtype=np.float32)
    if pts.shape != (4, 2):
        raise ValueError(f"Expected array of shape (4, 2), got {pts.shape}")

    rect = np.zeros((4, 2), dtype=np.float32)

    # Sum of coordinates
    s = pts.sum(axis=1)
    rect[0] = pts[np.argmin(s)]  # Top-left
    rect[2] = pts[np.argmax(s)]  # Bottom-right

    # Difference of coordinates (y - x)
    diff = pts[:, 1] - pts[:, 0]
    rect[1] = pts[np.argmin(diff)]  # Top-right
    rect[3] = pts[np.argmax(diff)]  # Bottom-left

    return rect


def warp_quadrilateral(image: np.ndarray, src_corners: np.ndarray, dst_w: int, dst_h: int) -> Tuple[np.ndarray, np.ndarray]:
    """
    Performs a 4-point perspective warp into a canonical rectangle of (dst_w, dst_h).
    Returns (warped_image, transform_matrix).
    """
    ordered_src = order_quad_points(src_corners)
    dst_corners = np.array([
        [0.0, 0.0],
        [float(dst_w - 1), 0.0],
        [float(dst_w - 1), float(dst_h - 1)],
        [0.0, float(dst_h - 1)]
    ], dtype=np.float32)

    transform_matrix = cv2.getPerspectiveTransform(ordered_src, dst_corners)
    warped = cv2.warpPerspective(
        image,
        transform_matrix,
        (dst_w, dst_h),
        flags=cv2.INTER_LINEAR,
        borderMode=cv2.BORDER_REPLICATE
    )
    return warped, transform_matrix


def rotate_image(image: np.ndarray, angle_deg: int) -> np.ndarray:
    """
    Rotate image by exact 90, 180, or 270 degrees.
    """
    angle = angle_deg % 360
    if angle == 90:
        return cv2.rotate(image, cv2.ROTATE_90_CLOCKWISE)
    elif angle == 180:
        return cv2.rotate(image, cv2.ROTATE_180)
    elif angle == 270:
        return cv2.rotate(image, cv2.ROTATE_90_COUNTERCLOCKWISE)
    elif angle == 0:
        return image
    else:
        # Arbitrary rotation
        h, w = image.shape[:2]
        center = (w / 2.0, h / 2.0)
        m = cv2.getRotationMatrix2D(center, -angle, 1.0)
        return cv2.warpAffine(image, m, (w, h), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)


def apply_margin_inset(
    box: Tuple[int, int, int, int],
    erosion_ratio_x: float = 0.15,
    erosion_ratio_y: float = 0.15
) -> Tuple[int, int, int, int]:
    """
    Applies an internal margin inset to an (x, y, w, h) bounding box,
    eroding border artifacts.
    """
    x, y, w, h = box
    inset_x = int(round(w * erosion_ratio_x))
    inset_y = int(round(h * erosion_ratio_y))

    new_x = x + inset_x
    new_y = y + inset_y
    new_w = max(1, w - 2 * inset_x)
    new_h = max(1, h - 2 * inset_y)

    return new_x, new_y, new_w, new_h


def compute_patch_statistics(patch_bgr: np.ndarray) -> Tuple[
    Tuple[float, float, float],  # mean_bgr
    Tuple[float, float, float],  # mean_rgb
    Tuple[float, float, float],  # mean_lab
    Tuple[float, float, float],  # median_rgb
    Tuple[float, float, float],  # median_lab
    Tuple[float, float, float],  # std_rgb
]:
    """
    Computes robust color space statistics across a 2D/3D patch:
    Mean, median, and std in RGB and CIELAB color spaces.
    """
    if patch_bgr.size == 0:
        zero3 = (0.0, 0.0, 0.0)
        return zero3, zero3, zero3, zero3, zero3, zero3

    # Reshape to (N, 3)
    flat_bgr = patch_bgr.reshape(-1, 3).astype(np.float32)
    mean_bgr = tuple(float(v) for v in np.mean(flat_bgr, axis=0))

    # RGB
    flat_rgb = flat_bgr[:, ::-1]
    mean_rgb = tuple(float(v) for v in np.mean(flat_rgb, axis=0))
    median_rgb = tuple(float(v) for v in np.median(flat_rgb, axis=0))
    std_rgb = tuple(float(v) for v in np.std(flat_rgb, axis=0))

    # CIELAB
    patch_lab = cv2.cvtColor(patch_bgr, cv2.COLOR_BGR2Lab).astype(np.float32)
    flat_lab = patch_lab.reshape(-1, 3)

    # In OpenCV, 8-bit Lab has L in [0..255] (scaled: L* = L*255/100), a in [0..255], b in [0..255].
    # Standard CIE L*a*b* is L: [0..100], a: [-128..127], b: [-128..127]
    # We calculate OpenCV native mean and standard CIE values:
    l_std = flat_lab[:, 0] * (100.0 / 255.0)
    a_std = flat_lab[:, 1] - 128.0
    b_std = flat_lab[:, 2] - 128.0
    cie_lab = np.column_stack([l_std, a_std, b_std])

    mean_lab = tuple(float(v) for v in np.mean(cie_lab, axis=0))
    median_lab = tuple(float(v) for v in np.median(cie_lab, axis=0))

    return mean_bgr, mean_rgb, mean_lab, median_rgb, median_lab, std_rgb


def draw_styled_box(
    canvas: np.ndarray,
    bbox: Tuple[int, int, int, int],
    label: str,
    color_bgr: Tuple[int, int, int],
    thickness: int = 2
) -> None:
    """
    Draws an annotated bounding box with a clean label header pill.
    """
    x, y, w, h = bbox
    # Main rectangle
    cv2.rectangle(canvas, (x, y), (x + w, y + h), color_bgr, thickness)

    # Label header
    font = cv2.FONT_HERSHEY_SIMPLEX
    font_scale = 0.45
    font_thickness = 1
    (text_w, text_h), baseline = cv2.getTextSize(label, font, font_scale, font_thickness)

    label_y1 = max(0, y - text_h - baseline - 4)
    label_y2 = y
    label_x2 = min(canvas.shape[1], x + text_w + 8)

    # Pill background
    cv2.rectangle(canvas, (x, label_y1), (label_x2, label_y2), color_bgr, -1)

    # Text color: white for dark backgrounds, dark for light backgrounds
    luminance = 0.299 * color_bgr[2] + 0.587 * color_bgr[1] + 0.114 * color_bgr[0]
    text_color = (0, 0, 0) if luminance > 140 else (255, 255, 255)

    cv2.putText(
        canvas,
        label,
        (x + 4, y - baseline - 2),
        font,
        font_scale,
        text_color,
        font_thickness,
        cv2.LINE_AA
    )
