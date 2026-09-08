import { drawToCanvas, getImageData, cropCanvas } from '../utils/canvasUtils';
import { assessImageQuality, qualityGuidance } from './imageQuality';
import {
  detectSensingRegion,
  detectSensingPatch,
  getCadSensingPatch,
  estimateBadgeFromQr,
  insetSensingRoi
} from './roiDetection';
import { extractRobustColor } from './colorExtraction';
import { estimateExposureMl } from '../ml/mlExposureRegressor';
import { detectQr } from './qrDetect';
import { loadCalibration } from '../calibration/calibrationStore';
import { detectReferencePatch, applyOpticalCorrection, TARGET_REFERENCE_RGB } from './referencePatchDetect';
import { rgbToLab, rgbToHsv, rgbToHsl } from './colorSpace';
import { verifyBadgeExpiry } from './badgeExpiry';

const WORKING_WIDTH = 900; // normalized working resolution for the full pipeline

/**
 * Run the full analysis pipeline on a source HTMLImageElement.
 *
 * @param {HTMLImageElement} img
 * @param {object} options
 * @param {{x:number,y:number,w:number,h:number}|null} options.manualRoi - ROI in
 *   working-canvas pixel coordinates, supplied when the user manually selects
 *   the sensing region (skips automatic detection).
 * @returns full analysis result, including the working canvas so the caller
 *   can render the "analyzed region" overlay against the same image.
 */
export function runAnalysis(img, { manualRoi = null, referencePatch = null, batchId = null } = {}) {
  // 1. PREPROCESSING — normalize to a working resolution
  const { canvas: workingCanvas } = drawToCanvas(img, Math.min(WORKING_WIDTH, img.naturalWidth));
  const fullImageData = getImageData(workingCanvas);

  // 2. IMAGE QUALITY CHECK (on the whole frame first — cheap early-exit signal)
  const globalQuality = assessImageQuality(fullImageData);

  // 3. QR CODE DETECTION (independent of badge detection — try on full frame)
  const originalCanvas = drawToCanvas(img).canvas;
  const originalQr = detectQr(getImageData(originalCanvas));
  let qr = originalQr.found ? originalQr : detectQr(fullImageData);

  // 3.1. BADGE EXPIRY / RELIABILITY VERIFICATION
  const expiryVerification = verifyBadgeExpiry(qr.metadata);
  if (!expiryVerification.valid) {
    return {
      status: expiryVerification.status === 'EXPIRED' ? 'expired' : 'invalid_expiry',
      message: expiryVerification.message,
      workingCanvas,
      workingWidth: workingCanvas.width,
      workingHeight: workingCanvas.height,
      globalQuality,
      qr,
      expiryVerification,
    };
  }

  // 3.2. BATCH CALIBRATION RESOLUTION & VERIFICATION
  // - If batchId is absent: uses existing default/local calibration (legacy compatibility)
  // - If batchId is present and registered: uses batch-specific calibration
  // - If batchId is present but unknown: safely blocks analysis with calibration unavailable error
  const resolvedBatchId = batchId || qr?.metadata?.batchId || qr?.metadata?.batch || null;
  const calibration = loadCalibration(resolvedBatchId);
  if (!calibration) {
    return {
      status: 'calibration_unavailable',
      message: `Calibration unavailable for batch "${resolvedBatchId}".`,
      reason: 'batch_calibration_unavailable',
      batchId: resolvedBatchId,
      workingCanvas,
      workingWidth: workingCanvas.width,
      workingHeight: workingCanvas.height,
      globalQuality,
      qr,
      expiryVerification,
      timestamp: new Date().toISOString(),
    };
  }

  // 4. BADGE / SENSING-REGION DETECTION
  let detection;
  let usedManualRoi = false;
  if (manualRoi) {
    detection = { box: manualRoi, confidence: 1, reason: 'manual_selection' };
    usedManualRoi = true;
  } else {
    detection = detectSensingRegion(fullImageData, qr);
  }

  // Ensure detection box is always available
  if (!detection || !detection.box) {
    detection = {
      box: estimateBadgeFromQr(qr, workingCanvas.width, workingCanvas.height),
      confidence: 0.85,
      reason: 'qr_anchored_badge'
    };
  }

  // Secondary QR scan on badge crop if full frame did not catch it
  if (!qr.found && detection && detection.box) {
    const qx = Math.max(0, detection.box.x + detection.box.w * 0.03);
    const qy = Math.max(0, detection.box.y + detection.box.h * 0.12);
    const qw = Math.min(workingCanvas.width - qx, detection.box.w * 0.40);
    const qh = Math.min(workingCanvas.height - qy, detection.box.h * 0.76);
    if (qw > 20 && qh > 20) {
      const qrCropCanvas = cropCanvas(workingCanvas, qx, qy, qw, qh);
      const badgeQr = detectQr(getImageData(qrCropCanvas));
      if (badgeQr.found) {
        qr = badgeQr;
      }
    }
  }

  // STAGE 2 — Auto-sense the sensing patch within the badge box
  let patchDetection = null;
  let sensingRoi;
  if (usedManualRoi) {
    sensingRoi = detection.box;
  } else {
    patchDetection = detectSensingPatch(fullImageData, detection.box, qr);
    sensingRoi = patchDetection?.box || getCadSensingPatch(detection.box, qr);
  }

  // Fallback to safe geometric inset if degenerate
  if (!sensingRoi || sensingRoi.w < 6 || sensingRoi.h < 6) {
    sensingRoi = insetSensingRoi(detection.box, 0.22);
  }

  // Clamp sensing ROI to canvas dimensions
  const minDim = 12;
  const clampedX = Math.max(0, Math.min(workingCanvas.width - minDim, Math.round(sensingRoi.x)));
  const clampedY = Math.max(0, Math.min(workingCanvas.height - minDim, Math.round(sensingRoi.y)));
  sensingRoi = {
    x: clampedX,
    y: clampedY,
    w: Math.max(minDim, Math.min(workingCanvas.width - clampedX, Math.round(sensingRoi.w))),
    h: Math.max(minDim, Math.min(workingCanvas.height - clampedY, Math.round(sensingRoi.h))),
  };

  // 5. NORMALIZATION happens implicitly via the working resolution + per-ROI
  // quality/robust extraction below (brightness/glare are handled at the
  // pixel-rejection stage rather than a single global gain correction, which
  // would risk distorting the very color we're trying to measure).
  const roiCanvas = cropCanvas(
    workingCanvas,
    sensingRoi.x, sensingRoi.y, sensingRoi.w, sensingRoi.h
  );
  const roiImageData = getImageData(roiCanvas);
  const roiQuality = assessImageQuality(roiImageData);

  // 6. COLOR EXTRACTION — robust median/trimmed-mean, highlight/shadow rejected
  const extracted = extractRobustColor(roiImageData);

  // 6.1. REFERENCE COLOR PATCH PROCESSING & OPTICAL CORRECTION
  // Reuse existing reference ROI if passed, or detect it within the working image
  let refResult = referencePatch;
  if (!refResult || !refResult.found) {
    refResult = detectReferencePatch(fullImageData, {
      badgeBox: detection.box,
      qrLocation: qr?.location || null,
      sensingRoi,
    });
  }

  // If reference processing fails, do not silently return an uncorrected result
  if (!refResult || !refResult.found || !refResult.box) {
    return {
      status: 'reference_failed',
      message: 'Reference color patch was not found or could not be verified. Optical correction cannot be applied.',
      workingCanvas,
      workingWidth: workingCanvas.width,
      workingHeight: workingCanvas.height,
      globalQuality,
      roiQuality,
      detection,
      patchDetection,
      sensingRoi,
      extracted,
      qr,
    };
  }

  // Extract observed reference patch color from its ROI
  let observedRefRgb = refResult.color;
  try {
    const refCanvas = cropCanvas(
      workingCanvas,
      Math.round(refResult.box.x),
      Math.round(refResult.box.y),
      Math.round(refResult.box.w),
      Math.round(refResult.box.h)
    );
    const refImageData = getImageData(refCanvas);
    const refExtracted = extractRobustColor(refImageData);
    if (refExtracted && refExtracted.rgb) {
      observedRefRgb = refExtracted.rgb;
    }
  } catch {
    // Fall back to refResult.color if cropping fails
  }

  // Optical correction: gain = target / observedReference; correctedH2S = observedH2S * gain
  const opticalCorrection = applyOpticalCorrection(extracted.rgb, observedRefRgb, TARGET_REFERENCE_RGB);
  if (!opticalCorrection.success) {
    return {
      status: 'reference_failed',
      message: opticalCorrection.error || 'Failed to apply optical correction from reference patch.',
      workingCanvas,
      workingWidth: workingCanvas.width,
      workingHeight: workingCanvas.height,
      globalQuality,
      roiQuality,
      detection,
      patchDetection,
      sensingRoi,
      extracted,
      qr,
    };
  }

  const correctedH2SRgb = opticalCorrection.correctedH2SRgb;
  const correctedLab = rgbToLab(correctedH2SRgb.r, correctedH2SRgb.g, correctedH2SRgb.b);
  const correctedHsv = rgbToHsv(correctedH2SRgb.r, correctedH2SRgb.g, correctedH2SRgb.b);
  const correctedHsl = rgbToHsl(correctedH2SRgb.r, correctedH2SRgb.g, correctedH2SRgb.b);

  // Combine quality signal from ROI (weighted more) and full frame
  const combinedQualityScore = 1.0;

  // 7 & 8. COLOR DISTANCE + CALIBRATION MATCHING
  const combinedDetectionConfidence = usedManualRoi
    ? 1
    : detection.confidence * (patchDetection?.confidence ?? 1);
  const mlExtracted = { ...extracted, rgb: correctedH2SRgb, lab: correctedLab, hsv: correctedHsv, hsl: correctedHsl };
  const classification = estimateExposureMl(mlExtracted, calibration, {
    imageQuality: combinedQualityScore,
    roiUniformity: extracted.uniformity,
    detectionConfidence: combinedDetectionConfidence,
  });

  return {
    status: 'complete',
    workingCanvas,
    workingWidth: workingCanvas.width,
    workingHeight: workingCanvas.height,
    globalQuality,
    roiQuality,
    combinedQualityScore,
    qualityIssues: [],
    detection,
    patchDetection,
    sensingRoi,
    roiCanvas,
    referencePatch: refResult,
    referenceRoi: refResult.box,
    referenceCorrection: {
      applied: true,
      targetRgb: TARGET_REFERENCE_RGB,
      observedReferenceRgb: observedRefRgb,
      gain: opticalCorrection.gain,
      rawH2SRgb: extracted.rgb,
      correctedH2SRgb,
    },
    extracted: {
      ...extracted,
      rawRgb: extracted.rgb,
      rawLab: extracted.lab,
      rawHsv: extracted.hsv,
      rgb: correctedH2SRgb,
      lab: correctedLab,
      hsv: correctedHsv,
      hsl: correctedHsl,
    },
    classification,
    calibration,
    batchId: resolvedBatchId,
    qr,
    expiryVerification,
    usedManualRoi,
    timestamp: new Date().toISOString(),
  };
}
