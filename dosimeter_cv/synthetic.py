"""
Synthetic image generator for H2S Dosimeter Wristband Cards.
Produces realistic badge images with configurable exposure levels,
perspective skew, rotation, and background environments for testing and calibration.
"""

from typing import Optional, Tuple, Dict, Any
import json
import numpy as np
import cv2

from .models import CardGeometryConfig
from .utils import rotate_image


def generate_synthetic_qr(payload: str, size: int) -> np.ndarray:
    """
    Generates a QR code image as a BGR numpy array.
    Uses the `qrcode` library if available; otherwise synthesizes
    a compliant QR-like matrix with standard finder patterns.
    """
    try:
        import qrcode
        qr = qrcode.QRCode(
            version=1,
            error_correction=qrcode.constants.ERROR_CORRECT_M,
            box_size=10,
            border=2
        )
        qr.add_data(payload)
        qr.make(fit=True)
        img = qr.make_image(fill_color="black", back_color="white")
        pil_img = img.convert('RGB')
        bgr = cv2.cvtColor(np.array(pil_img), cv2.COLOR_RGB2BGR)
        return cv2.resize(bgr, (size, size), interpolation=cv2.INTER_NEAREST)
    except ImportError:
        # High-fidelity synthetic fallback with standard QR finder patterns
        canvas = np.full((size, size, 3), 255, dtype=np.uint8)
        grid_n = 25
        cell = size // grid_n

        # Seed pseudo-random matrix deterministically based on payload
        np.random.seed(abs(hash(payload)) % (2**31))
        random_grid = np.random.choice([0, 255], size=(grid_n, grid_n), p=[0.45, 0.55]).astype(np.uint8)

        def draw_finder(gx: int, gy: int):
            # 7x7 outer black
            random_grid[gy:gy+7, gx:gx+7] = 0
            # 5x5 inner white
            random_grid[gy+1:gy+6, gx+1:gx+6] = 255
            # 3x3 center black
            random_grid[gy+2:gy+5, gx+2:gx+5] = 0

        # Draw 3 canonical finder patterns: Top-Left, Top-Right, Bottom-Left
        draw_finder(0, 0)
        draw_finder(grid_n - 7, 0)
        draw_finder(0, grid_n - 7)

        # Timing patterns
        for i in range(8, grid_n - 8):
            val = 0 if (i % 2 == 0) else 255
            random_grid[6, i] = val
            random_grid[i, 6] = val

        # Render grid onto canvas
        for r in range(grid_n):
            for c in range(grid_n):
                color = int(random_grid[r, c])
                canvas[r * cell:(r + 1) * cell, c * cell:(c + 1) * cell] = (color, color, color)

        return canvas


def generate_canonical_badge(
    config: Optional[CardGeometryConfig] = None,
    batch_id: str = "BATCH-H2S-2026-09A",
    exposure_state: str = "moderate",
    custom_reagent_rgb: Optional[Tuple[int, int, int]] = None
) -> Tuple[np.ndarray, Dict[str, Any]]:
    """
    Generates a pristine 1000 x 400 canonical dosimeter wristband badge image.
    """
    cfg = config or CardGeometryConfig()
    w, h = cfg.canonical_width, cfg.canonical_height

    # Reagent color mapping based on exposure level
    exposure_colors = {
        "unexposed": (242, 233, 216),  # Pale cream
        "low": (224, 199, 158),        # Light tan
        "moderate": (187, 146, 98),    # Warm brown
        "high": (122, 84, 48),         # Dark brown
        "critical": (51, 35, 24)       # Deep charcoal/black
    }
    reagent_rgb = custom_reagent_rgb or exposure_colors.get(exposure_state, (187, 146, 98))
    reagent_bgr = (reagent_rgb[2], reagent_rgb[1], reagent_rgb[0])

    # 1. Base badge body (graphite matte finish)
    badge = np.full((h, w, 3), (45, 48, 52), dtype=np.uint8)

    # Subtle inner bevel / border
    cv2.rectangle(badge, (8, 8), (w - 8, h - 8), (60, 64, 70), 2)
    cv2.rectangle(badge, (12, 12), (w - 12, h - 12), (30, 32, 35), 1)

    # Header and footer typography
    font = cv2.FONT_HERSHEY_SIMPLEX
    cv2.putText(badge, "H2S PASSIVE DOSIMETER", (40, 48), font, 0.75, (230, 235, 240), 2, cv2.LINE_AA)
    cv2.putText(badge, "OPTICAL EXPOSURE BADGE v2.4", (40, 72), font, 0.42, (160, 168, 175), 1, cv2.LINE_AA)
    cv2.putText(badge, f"BATCH: {batch_id}  |  STATUS: {exposure_state.upper()}", (40, 375), font, 0.45, (180, 190, 200), 1, cv2.LINE_AA)

    # Payload metadata
    payload_dict = {
        "batch": batch_id,
        "type": "H2S-DOSIMETER-BAND",
        "cal_factor": 1.042,
        "mfg_date": "2026-09-01",
        "exp_date": "2027-03-01"
    }
    payload_str = json.dumps(payload_dict)

    # 2. Block 1: QR Code
    qx, qy, qw, qh = cfg.qr_roi.to_pixels(w, h)
    # White background backer
    cv2.rectangle(badge, (qx - 6, qy - 6), (qx + qw + 6, qy + qh + 6), (245, 245, 245), -1)
    cv2.rectangle(badge, (qx - 6, qy - 6), (qx + qw + 6, qy + qh + 6), (180, 180, 180), 1)
    qr_img = generate_synthetic_qr(payload_str, min(qw, qh))
    badge[qy:qy+qr_img.shape[0], qx:qx+qr_img.shape[1]] = qr_img
    cv2.putText(badge, "BLOCK 1: FIDUCIAL / QR", (qx, qy - 12), font, 0.38, (170, 180, 190), 1, cv2.LINE_AA)

    # 3. Block 2: Optical Reference Palette (7 Swatches)
    rx, ry, rw, rh = cfg.ref_bar_roi.to_pixels(w, h)
    # Outer white/gray housing for reference bar
    cv2.rectangle(badge, (rx - 4, ry - 4), (rx + rw + 4, ry + rh + 4), (235, 235, 235), -1)
    cv2.rectangle(badge, (rx - 4, ry - 4), (rx + rw + 4, ry + rh + 4), (100, 100, 100), 1)

    n_swatches = len(cfg.swatch_names)
    swatch_w = rw // n_swatches
    for i, name in enumerate(cfg.swatch_names):
        s_rgb = cfg.nominal_swatch_srgb[name]
        s_bgr = (s_rgb[2], s_rgb[1], s_rgb[0])
        sx = rx + i * swatch_w
        sy = ry
        # Swatch fill
        cv2.rectangle(badge, (sx, sy), (sx + swatch_w, sy + rh), s_bgr, -1)
        # Separator line
        cv2.rectangle(badge, (sx, sy), (sx + swatch_w, sy + rh), (40, 40, 40), 1)

    cv2.putText(badge, "BLOCK 2: REFERENCE PALETTE", (rx, ry - 12), font, 0.38, (170, 180, 190), 1, cv2.LINE_AA)

    # 4. Block 3: Sensing Region (Active Strip + Protected Baseline Patch)
    sx, sy, sw, sh = cfg.sensor_strip_roi.to_pixels(w, h)
    cx, cy, cw, ch = cfg.control_patch_roi.to_pixels(w, h)

    # Active Cu-reagent strip
    cv2.rectangle(badge, (sx - 4, sy - 4), (sx + sw + 4, sy + sh + 4), (70, 75, 82), -1)
    cv2.rectangle(badge, (sx, sy), (sx + sw, sy + sh), reagent_bgr, -1)
    cv2.rectangle(badge, (sx, sy), (sx + sw, sy + sh), (30, 30, 30), 1)

    # Protected Control baseline patch (unexposed baseline)
    control_bgr = (204, 212, 214)
    cv2.rectangle(badge, (cx - 3, cy - 3), (cx + cw + 3, cy + ch + 3), (70, 75, 82), -1)
    cv2.rectangle(badge, (cx, cy), (cx + cw, cy + ch), control_bgr, -1)
    cv2.rectangle(badge, (cx, cy), (cx + cw, cy + ch), (30, 30, 30), 1)

    cv2.putText(badge, "BLOCK 3: SENSOR & CTRL", (sx, sy - 12), font, 0.38, (170, 180, 190), 1, cv2.LINE_AA)

    return badge, payload_dict


def generate_scene_image(
    badge_img: np.ndarray,
    scene_width: int = 1400,
    scene_height: int = 900,
    rotation_deg: int = 0,
    perspective_skew: float = 0.0,
    noise_sigma: float = 2.0
) -> Tuple[np.ndarray, np.ndarray]:
    """
    Places the canonical badge inside a realistic camera scene with configurable
    background surface, perspective slant, rotation, and camera noise.
    Returns: (scene_image, badge_corners_in_scene)
    """
    # 1. Create desk / tabletop background with subtle gradient
    scene = np.zeros((scene_height, scene_width, 3), dtype=np.uint8)
    for y in range(scene_height):
        grad = int(185 + (y / scene_height) * 35)
        scene[y, :] = (grad - 15, grad, grad + 10)

    # Add realistic texture noise
    texture = np.random.normal(0, 4, (scene_height, scene_width, 3)).astype(np.float32)
    scene = np.clip(scene.astype(np.float32) + texture, 0, 255).astype(np.uint8)

    # Badge original corners
    bw, bh = badge_img.shape[1], badge_img.shape[0]
    src_corners = np.array([
        [0.0, 0.0],
        [float(bw), 0.0],
        [float(bw), float(bh)],
        [0.0, float(bh)]
    ], dtype=np.float32)

    # Target placement on scene
    margin_x = (scene_width - bw) // 2
    margin_y = (scene_height - bh) // 2

    dst_corners = np.array([
        [float(margin_x), float(margin_y)],
        [float(margin_x + bw), float(margin_y)],
        [float(margin_x + bw), float(margin_y + bh)],
        [float(margin_x), float(margin_y + bh)]
    ], dtype=np.float32)

    # Apply perspective skew if requested
    if perspective_skew > 0:
        skew_px = perspective_skew * 100.0
        dst_corners[0] += [-skew_px * 0.5, skew_px]
        dst_corners[1] += [skew_px * 0.7, -skew_px * 0.4]
        dst_corners[2] += [-skew_px * 0.3, skew_px * 0.6]
        dst_corners[3] += [skew_px * 0.4, -skew_px * 0.5]

    # Compute homography to warp badge into scene
    h_matrix, _ = cv2.findHomography(src_corners, dst_corners)
    warped_badge = cv2.warpPerspective(
        badge_img,
        h_matrix,
        (scene_width, scene_height),
        flags=cv2.INTER_LINEAR,
        borderMode=cv2.BORDER_CONSTANT,
        borderValue=(0, 0, 0)
    )

    # Badge mask for compositing
    badge_mask = cv2.warpPerspective(
        np.full((bh, bw), 255, dtype=np.uint8),
        h_matrix,
        (scene_width, scene_height),
        flags=cv2.INTER_NEAREST,
        borderMode=cv2.BORDER_CONSTANT,
        borderValue=0
    )

    # Composite onto scene
    inv_mask = cv2.bitwise_not(badge_mask)
    bg_part = cv2.bitwise_and(scene, scene, mask=inv_mask)
    fg_part = cv2.bitwise_and(warped_badge, warped_badge, mask=badge_mask)
    final_scene = cv2.add(bg_part, fg_part)

    # Apply camera sensor noise
    if noise_sigma > 0:
        sensor_noise = np.random.normal(0, noise_sigma, final_scene.shape).astype(np.float32)
        final_scene = np.clip(final_scene.astype(np.float32) + sensor_noise, 0, 255).astype(np.uint8)

    # Apply rotation if specified
    if rotation_deg in (90, 180, 270):
        final_scene = rotate_image(final_scene, rotation_deg)
        # Transform corner coordinates accordingly
        if rotation_deg == 180:
            dst_corners = np.array([
                [scene_width - x, scene_height - y] for (x, y) in dst_corners
            ], dtype=np.float32)

    return final_scene, dst_corners
