import { drawToCanvas, getImageData } from '../utils/canvasUtils';
import { detectQr } from './qrDetect';
import { detectSensingRegion, detectSensingPatch } from './roiDetection';
import { detectReferencePatch } from './referencePatchDetect';

const WORKING_WIDTH = 900;

/**
 * Pre-flight validation gate for H2S dosimeter badge images.
 *
 * Checks that the badge image contains all three mandatory regions:
 *  1. QR code
 *  2. Reference color patch
 *  3. H2S sensing strip
 *
 * If any of these regions is missing, returns isValid = false and a descriptive
 * rejectionReason listing precisely which region(s) could not be found.
 *
 * @param {HTMLImageElement|HTMLCanvasElement|ImageData} source - badge input
 * @returns {{
 *   isValid: boolean,
 *   missingRegions: string[],
 *   rejectionReason: string|null,
 *   regions: {
 *     qr: { found: boolean, result: object },
 *     referencePatch: { found: boolean, result: object },
 *     sensingStrip: { found: boolean, detection: object, patchDetection: object|null }
 *   },
 *   workingCanvas: HTMLCanvasElement|null,
 *   fullImageData: ImageData
 * }}
 */
export function validateBadgeRegions(source) {
  let fullImageData;
  let workingCanvas = null;

  // Handle ImageData directly (e.g. Node tests / raw pixel buffers)
  if (source && source.data && source.width && source.height) {
    fullImageData = source;
  } else if (typeof document !== 'undefined' && source) {
    // Browser environment: normalize to working canvas
    const targetWidth = source.naturalWidth
      ? Math.min(WORKING_WIDTH, source.naturalWidth)
      : Math.min(WORKING_WIDTH, source.width || WORKING_WIDTH);
    const rendered = drawToCanvas(source, targetWidth);
    workingCanvas = rendered.canvas;
    fullImageData = getImageData(workingCanvas);
  } else {
    throw new Error('Invalid image source provided to validateBadgeRegions.');
  }

  // 1. QR Code Detection
  // Run on fullImageData first so coordinates directly match the working pixel space
  let qr = detectQr(fullImageData);
  if (!qr || !qr.found) {
    if (typeof document !== 'undefined' && source && source.naturalWidth && source.naturalHeight) {
      try {
        const orig = drawToCanvas(source).canvas;
        const origQr = detectQr(getImageData(orig));
        if (origQr && origQr.found) {
          const scale = fullImageData.width / orig.width;
          qr = {
            ...origQr,
            location: origQr.location ? {
              topLeftCorner: { x: origQr.location.topLeftCorner.x * scale, y: origQr.location.topLeftCorner.y * scale },
              topRightCorner: { x: origQr.location.topRightCorner.x * scale, y: origQr.location.topRightCorner.y * scale },
              bottomLeftCorner: { x: origQr.location.bottomLeftCorner.x * scale, y: origQr.location.bottomLeftCorner.y * scale },
              bottomRightCorner: { x: origQr.location.bottomRightCorner.x * scale, y: origQr.location.bottomRightCorner.y * scale },
            } : null,
          };
        }
      } catch {
        // ignore, fall back to working image data
      }
    }
  }
  const qrFound = Boolean(qr && qr.found);

  // 2. H2S Sensing Strip Detection (outer badge box + inner sensing patch)
  const detection = detectSensingRegion(fullImageData);
  let sensingStripFound = false;
  let patchDetection = null;

  if (detection && detection.box && detection.confidence >= 0.35) {
    patchDetection = detectSensingPatch(fullImageData, detection.box);
    if (
      patchDetection &&
      patchDetection.box &&
      patchDetection.confidence >= 0.30 &&
      patchDetection.box.w >= 6 &&
      patchDetection.box.h >= 6
    ) {
      sensingStripFound = true;
    }
  }

  // 3. Reference Color Patch Detection
  const refPatch = detectReferencePatch(fullImageData, {
    badgeBox: detection?.box || null,
    qrLocation: qr?.location || null,
    sensingRoi: patchDetection?.box || null,
  });
  const refPatchFound = Boolean(refPatch && refPatch.found);

  // Compile missing regions
  const missingRegions = [];
  if (!qrFound) missingRegions.push('QR code');
  if (!refPatchFound) missingRegions.push('Reference color patch');
  if (!sensingStripFound) missingRegions.push('H₂S sensing strip');

  const isValid = missingRegions.length === 0;

  let rejectionReason = null;
  if (!isValid) {
    if (missingRegions.length === 3) {
      rejectionReason = 'Badge validation failed: None of the required regions (QR code, Reference color patch, H₂S sensing strip) were found.';
    } else {
      rejectionReason = `Badge validation failed: Missing required region(s): ${missingRegions.join(', ')}.`;
    }
  }

  return {
    isValid,
    missingRegions,
    rejectionReason,
    regions: {
      qr: { found: qrFound, result: qr },
      referencePatch: { found: refPatchFound, result: refPatch },
      sensingStrip: { found: sensingStripFound, detection, patchDetection },
    },
    workingCanvas,
    fullImageData,
  };
}
