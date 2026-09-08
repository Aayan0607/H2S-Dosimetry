import { deltaE2000 } from './colorSpace';
import { withLab } from '../calibration/calibrationData';

/**
 * Classify an extracted color against the calibration reference set.
 *
 * Confidence factors (all 0-1, combined):
 *  - separation: how much closer the nearest reference is vs. the second
 *    nearest (an ambiguous color sitting between two states should score low)
 *  - closeness: how small the absolute Delta E to the nearest reference is
 *  - imageQuality: passed in from the lighting/exposure check
 *  - roiUniformity: passed in from color extraction (mottled patch = less trustworthy)
 *  - detectionConfidence: passed in from ROI/badge detection
 */
export function classifyColor(extractedLab, calibration, factors) {
  const cal = withLab(calibration).sort((a, b) => a.order - b.order);

  const distances = cal.map((state) => ({
    state,
    deltaE: deltaE2000(extractedLab, state.lab),
  }));
  distances.sort((a, b) => a.deltaE - b.deltaE);

  const nearest = distances[0];
  const secondNearest = distances[1];

  // Closeness: DeltaE of 0 -> 1.0 confidence contribution; DeltaE >= 30 -> ~0
  const closeness = Math.max(0, 1 - nearest.deltaE / 30);

  // Separation: how decisively nearest beats second-nearest
  const gap = secondNearest.deltaE - nearest.deltaE;
  const separation = Math.max(0, Math.min(1, gap / 12));

  const {
    imageQuality = 1,
    roiUniformity = 1,
    detectionConfidence = 1,
  } = factors || {};

  const confidence =
    0.4 * closeness +
    0.32 * separation +
    0.12 * imageQuality +
    0.08 * roiUniformity +
    0.08 * detectionConfidence;

  const clampedConfidence = Math.max(0, Math.min(1, confidence));

  const UNCERTAIN_THRESHOLD = 0.45;
  // A color sitting almost equidistant between two references is inherently
  // ambiguous no matter how good the lighting/detection was — good image
  // quality should never be able to paper over genuine color ambiguity, so
  // this is enforced as a hard floor independent of the weighted score above.
  const AMBIGUOUS_GAP_THRESHOLD = 2.5;
  const isAmbiguous = gap < AMBIGUOUS_GAP_THRESHOLD;
  const isUncertain = clampedConfidence < UNCERTAIN_THRESHOLD || isAmbiguous;

  return {
    nearest: nearest.state,
    nearestDeltaE: nearest.deltaE,
    secondNearest: secondNearest.state,
    secondNearestDeltaE: secondNearest.deltaE,
    allDistances: distances,
    confidence: clampedConfidence,
    isUncertain,
    breakdown: {
      closeness,
      separation,
      imageQuality,
      roiUniformity,
      detectionConfidence,
    },
  };
}
