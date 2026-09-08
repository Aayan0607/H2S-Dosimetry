"""
Command-Line Runner and Demonstration Script for DosimeterBlockDetector.
Usage:
    python run_detector.py [--image path/to/card.jpg] [--output-dir ./output]
If no image is provided, a synthetic realistic dosimeter badge is generated and processed.
"""

import argparse
import os
import sys
import json
import cv2
import numpy as np

from dosimeter_cv.models import CardGeometryConfig
from dosimeter_cv.detector import DosimeterBlockDetector
from dosimeter_cv.quality import DosimeterQualityGate
from dosimeter_cv.synthetic import generate_canonical_badge, generate_scene_image


def main():
    parser = argparse.ArgumentParser(description="H2S Dosimeter 3-Block Detection & Perspective Rectification")
    parser.add_argument("--image", "-i", type=str, default=None, help="Path to input card image")
    parser.add_argument("--output-dir", "-o", type=str, default="output_debug", help="Directory to save debug images")
    parser.add_argument("--exposure", type=str, default="moderate", choices=["unexposed", "low", "moderate", "high", "critical"], help="Simulated exposure level for synthetic badge")
    parser.add_argument("--skew", type=float, default=0.06, help="Synthetic perspective skew factor")
    parser.add_argument("--rotate", type=int, default=0, choices=[0, 90, 180, 270], help="Synthetic rotation in degrees")

    args = parser.parse_args()

    os.makedirs(args.output_dir, exist_ok=True)

    # 1. Load or synthesize test image
    if args.image and os.path.exists(args.image):
        print(f"\n[INFO] Loading input image: {args.image}")
        input_img = cv2.imread(args.image)
        if input_img is None:
            print(f"[ERROR] Failed to read image from {args.image}")
            sys.exit(1)
    else:
        print(f"\n[INFO] Synthesizing realistic dosimeter wristband (Exposure: {args.exposure}, Skew: {args.skew}, Rotate: {args.rotate}°)...")
        canonical, payload = generate_canonical_badge(
            batch_id="DEMO-BATCH-2026-X1",
            exposure_state=args.exposure
        )
        input_img, _ = generate_scene_image(
            canonical,
            scene_width=1400,
            scene_height=900,
            rotation_deg=args.rotate,
            perspective_skew=args.skew,
            noise_sigma=1.5
        )
        synth_path = os.path.join(args.output_dir, "input_synthetic_scene.png")
        cv2.imwrite(synth_path, input_img)
        print(f"[INFO] Saved synthetic scene to {synth_path}")

    # 2. Run DosimeterBlockDetector
    detector = DosimeterBlockDetector()
    print("\n[INFO] Executing 3-Block Detection & Perspective Rectification...")
    result = detector.detect_and_rectify(input_img)

    # 3. Run DosimeterQualityGate
    print("\n[INFO] Executing Intelligent Image Quality Gating (DosimeterQualityGate)...")
    quality_gate = DosimeterQualityGate()
    quality_report = quality_gate.evaluate(
        image_bgr=input_img,
        badge_corners=result.card_corners if result.success else None,
        rectified_badge=result.rectified_badge if result.success else None
    )

    # 4. Print Results Summary
    print("\n" + "=" * 60)
    print("           DOSIMETER DETECTION SUMMARY")
    print("=" * 60)
    print(f"Status              : {'SUCCESS' if result.success else 'FAILED'}")
    print(f"Status Message      : {result.status_message}")
    print(f"Detection Method    : {result.detection_method}")
    print(f"Confidence Score    : {result.confidence_score:.2f}")
    print(f"Rotation Applied    : {result.rotation_applied_deg}°")
    print(f"QR Raw Data         : {result.qr_data or 'N/A'}")

    if result.qr_payload:
        print(f"QR Decoded JSON     : {json.dumps(result.qr_payload, indent=2)}")

    print("\n" + "=" * 60)
    print("           INTELLIGENT QUALITY REPORT")
    print("=" * 60)
    gate_status = "PASSED" if quality_report.is_valid else "FAILED / REJECTED"
    print(f"Quality Gate Status : {gate_status}")
    print(f"Quality Score       : {quality_report.quality_score:.1f} / 100")
    print(f"Predicted Category  : {quality_report.predicted_category.value}")

    print("\nMetrics:")
    for metric_name, val in quality_report.metrics.items():
        print(f"  - {metric_name:<20}: {val}")

    if quality_report.actionable_warnings:
        print("\nActionable Guidance:")
        for w in quality_report.actionable_warnings:
            print(f"  [!] {w}")
    else:
        print("\nActionable Guidance: None (Optimal Field Scan Conditions)")

    print("\n" + "-" * 60)
    print(f"{'SWATCH':<12} | {'MEAN RGB (R, G, B)':<20} | {'MEAN LAB (L*, a*, b*)':<22}")
    print("-" * 60)
    for sw in result.swatches:
        rgb_str = f"({sw.mean_rgb[0]:.1f}, {sw.mean_rgb[1]:.1f}, {sw.mean_rgb[2]:.1f})"
        lab_str = f"({sw.mean_lab[0]:.1f}, {sw.mean_lab[1]:.1f}, {sw.mean_lab[2]:.1f})"
        print(f"{sw.name:<12} | {rgb_str:<20} | {lab_str:<22}")
    print("-" * 60)

    # 5. Save Artifacts
    if result.rectified_badge is not None:
        rectified_path = os.path.join(args.output_dir, "rectified_badge_1000x400.png")
        cv2.imwrite(rectified_path, result.rectified_badge)
        print(f"\n[INFO] Saved rectified badge -> {rectified_path}")

    if result.annotated_image is not None:
        annotated_path = os.path.join(args.output_dir, "annotated_diagnostics.png")
        cv2.imwrite(annotated_path, result.annotated_image)
        print(f"[INFO] Saved annotated overlay -> {annotated_path}")

    # Save individual block crops
    if result.roi_crops:
        crops_dir = os.path.join(args.output_dir, "roi_crops")
        os.makedirs(crops_dir, exist_ok=True)
        for name, crop in result.roi_crops.items():
            crop_path = os.path.join(crops_dir, f"{name}.png")
            cv2.imwrite(crop_path, crop)
            print(f"[INFO] Saved ROI crop [{name}] -> {crop_path}")

    # Save quality report JSON
    report_json_path = os.path.join(args.output_dir, "quality_report.json")
    with open(report_json_path, "w") as f:
        json.dump({
            "is_valid": quality_report.is_valid,
            "quality_score": quality_report.quality_score,
            "predicted_category": quality_report.predicted_category.value,
            "actionable_warnings": quality_report.actionable_warnings,
            "category_confidences": quality_report.category_confidences,
            "metrics": quality_report.metrics
        }, f, indent=2)
    print(f"[INFO] Saved quality report -> {report_json_path}")

    print("\n[SUCCESS] Pipeline execution finished successfully.\n")


if __name__ == "__main__":
    main()
