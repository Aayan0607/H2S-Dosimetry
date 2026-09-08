import { rgbToLab, rgbToHsv } from './colorSpace';

const REF_WORK_DIM = 120;

/**
 * Downsample a bounding box region of imageData into a gw x gh grid of mean RGB cells.
 */
function buildGrid(imageData, bounds, maxDim) {
  const { data, width } = imageData;
  const { x0, y0, x1, y1 } = bounds;
  const regionW = x1 - x0;
  const regionH = y1 - y0;
  const scale = Math.min(1, maxDim / Math.max(regionW, regionH));
  const gw = Math.max(8, Math.round(regionW * scale));
  const gh = Math.max(8, Math.round(regionH * scale));

  const grid = new Array(gw * gh);
  const blockW = regionW / gw;
  const blockH = regionH / gh;

  for (let gy = 0; gy < gh; gy++) {
    for (let gx = 0; gx < gw; gx++) {
      const bx0 = x0 + Math.floor(gx * blockW);
      const by0 = y0 + Math.floor(gy * blockH);
      const bx1 = x0 + Math.min(regionW, Math.floor((gx + 1) * blockW));
      const by1 = y0 + Math.min(regionH, Math.floor((gy + 1) * blockH));
      let r = 0, g = 0, b = 0, n = 0;
      for (let y = by0; y < by1; y++) {
        for (let x = bx0; x < bx1; x++) {
          const idx = (y * width + x) * 4;
          r += data[idx]; g += data[idx + 1]; b += data[idx + 2];
          n++;
        }
      }
      n = Math.max(1, n);
      const mr = r / n;
      const mg = g / n;
      const mb = b / n;
      const lab = rgbToLab(mr, mg, mb);
      const hsv = rgbToHsv(mr, mg, mb);
      const chroma = Math.sqrt(lab.a * lab.a + lab.b * lab.b);
      grid[gy * gw + gx] = {
        r: mr, g: mg, b: mb, lab, hsv, chroma,
        x: bx0, y: by0, w: bx1 - bx0, h: by1 - by0,
      };
    }
  }
  return { grid, gw, gh, regionX0: x0, regionY0: y0, cellW: regionW / gw, cellH: regionH / gh };
}

/**
 * 4-connected components over a boolean mask on a gw x gh grid.
 */
function connectedComponents(mask, gw, gh) {
  const visited = new Uint8Array(gw * gh);
  const components = [];
  const stack = [];

  for (let start = 0; start < gw * gh; start++) {
    if (!mask[start] || visited[start]) continue;
    let minX = gw, maxX = -1, minY = gh, maxY = -1, count = 0;
    const cells = [];
    stack.push(start);
    visited[start] = 1;
    while (stack.length) {
      const idx = stack.pop();
      const x = idx % gw;
      const y = (idx / gw) | 0;
      count++;
      cells.push(idx);
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;

      const neighbors = [idx - 1, idx + 1, idx - gw, idx + gw];
      for (const n of neighbors) {
        if (n < 0 || n >= gw * gh) continue;
        if ((n === idx - 1 || n === idx + 1) && ((n / gw) | 0) !== y) continue;
        if (!visited[n] && mask[n]) {
          visited[n] = 1;
          stack.push(n);
        }
      }
    }
    components.push({ minX, maxX, minY, maxY, count, cells });
  }
  return components;
}

/**
 * Check if a box overlaps significantly with another box.
 */
function computeIoU(b1, b2) {
  if (!b1 || !b2) return 0;
  const xA = Math.max(b1.x, b2.x);
  const yA = Math.max(b1.y, b2.y);
  const xB = Math.min(b1.x + b1.w, b2.x + b2.w);
  const yB = Math.min(b1.y + b1.h, b2.y + b2.h);
  const interArea = Math.max(0, xB - xA) * Math.max(0, yB - yA);
  if (interArea <= 0) return 0;
  const area1 = b1.w * b1.h;
  const area2 = b2.w * b2.h;
  return interArea / Math.min(area1, area2);
}

/**
 * The prototype badge CAD places one vertical neutral-grey correction line
 * immediately to the right of the sensing patch. Check that deterministic
 * location before running the more permissive connected-component search.
 */
function detectExpectedGreyLine(imageData, sensingRoi) {
  if (!sensingRoi) return null;
  const box = {
    x: Math.round(sensingRoi.x + sensingRoi.w * 1.08),
    y: Math.round(sensingRoi.y + sensingRoi.h * 0.04),
    w: Math.max(8, Math.round(sensingRoi.w * 0.22)),
    h: Math.max(18, Math.round(sensingRoi.h * 0.92)),
  };
  box.x = Math.max(0, Math.min(imageData.width - box.w, box.x));
  box.y = Math.max(0, Math.min(imageData.height - box.h, box.y));
  if (box.x < 0 || box.y < 0 || box.x + box.w > imageData.width || box.y + box.h > imageData.height) return null;

  const insetX = Math.max(1, Math.round(box.w * 0.18));
  const insetY = Math.max(1, Math.round(box.h * 0.06));
  let r = 0, g = 0, b = 0, n = 0;
  for (let y = box.y + insetY; y < box.y + box.h - insetY; y++) {
    for (let x = box.x + insetX; x < box.x + box.w - insetX; x++) {
      const index = (y * imageData.width + x) * 4;
      r += imageData.data[index]; g += imageData.data[index + 1]; b += imageData.data[index + 2]; n++;
    }
  }
  if (!n) return null;
  const color = { r: Math.round(r / n), g: Math.round(g / n), b: Math.round(b / n) };
  const lab = rgbToLab(color.r, color.g, color.b);
  const hsv = rgbToHsv(color.r, color.g, color.b);
  const chroma = Math.sqrt(lab.a * lab.a + lab.b * lab.b);
  if (lab.l < 35 || lab.l > 95 || chroma > 22 || hsv.s > 0.25) return null;
  return { found: true, box, color, confidence: 0.92, reason: 'expected_single_grey_line' };
}

/**
 * Detect a Reference Color Patch within an image.
 *
 * Convention:
 * - A neutral calibration/reference patch, typically medium-to-light gray (L* in 45..92)
 *   with very low chroma (C* < 16, HSV saturation < 0.16).
 * - Distinguishable from the H2S sensing strip (which has active chemical color shift,
 *   higher chroma/warm hue, and larger surface area).
 * - Distinguishable from the QR code (which is a checkered black-and-white pattern)
 *   and from the dark wristband strap bezel (L* < 30).
 *
 * @param {ImageData} imageData
 * @param {object} [options]
 * @param {{x:number, y:number, w:number, h:number}} [options.badgeBox] - detected badge bounds
 * @param {object} [options.qrLocation] - QR code corner coordinates if detected
 * @param {{x:number, y:number, w:number, h:number}} [options.sensingRoi] - sensing patch bounds if detected
 * @returns {{ found: boolean, box: object|null, color: object|null, confidence: number, reason: string }}
 */
export function detectReferencePatch(imageData, { badgeBox = null, qrLocation = null, sensingRoi = null } = {}) {
  const imgW = imageData.width;
  const imgH = imageData.height;

  const expectedGreyLine = detectExpectedGreyLine(imageData, sensingRoi);
  if (expectedGreyLine) return expectedGreyLine;

  // 1. Search boundary: inside badge box if available, otherwise full frame with margin
  const bounds = badgeBox
    ? {
        x0: Math.max(0, Math.round(badgeBox.x)),
        y0: Math.max(0, Math.round(badgeBox.y)),
        x1: Math.min(imgW, Math.round(badgeBox.x + badgeBox.w)),
        y1: Math.min(imgH, Math.round(badgeBox.y + badgeBox.h)),
      }
    : { x0: 0, y0: 0, x1: imgW, y1: imgH };

  const regionW = bounds.x1 - bounds.x0;
  const regionH = bounds.y1 - bounds.y0;
  if (regionW < 20 || regionH < 20) {
    return { found: false, box: null, color: null, confidence: 0, reason: 'search_region_too_small' };
  }

  // Calculate approximate QR bounding box if qrLocation is provided
  let qrBox = null;
  if (qrLocation && qrLocation.topLeftCorner && qrLocation.bottomRightCorner) {
    const xs = [qrLocation.topLeftCorner.x, qrLocation.topRightCorner.x, qrLocation.bottomLeftCorner.x, qrLocation.bottomRightCorner.x];
    const ys = [qrLocation.topLeftCorner.y, qrLocation.topRightCorner.y, qrLocation.bottomLeftCorner.y, qrLocation.bottomRightCorner.y];
    const qx0 = Math.min(...xs);
    const qx1 = Math.max(...xs);
    const qy0 = Math.min(...ys);
    const qy1 = Math.max(...ys);
    qrBox = { x: qx0 - 8, y: qy0 - 8, w: qx1 - qx0 + 16, h: qy1 - qy0 + 16 };
  }

  // 2. Build grid of downsampled cells
  const g = buildGrid(imageData, bounds, REF_WORK_DIM);
  const totalCells = g.gw * g.gh;
  const mask = new Uint8Array(totalCells);

  // 3. Identify cells that match the neutral reference patch profile:
  // - Neutral: chroma < 16, saturation < 0.18
  // - Luminance: L* between 45 and 92 (rejects dark bezel < 35 and blown specular highlight > 95)
  // - Not inside the QR code
  for (let i = 0; i < totalCells; i++) {
    const cell = g.grid[i];
    const inQr = qrBox && cell.x >= qrBox.x && cell.x <= qrBox.x + qrBox.w && cell.y >= qrBox.y && cell.y <= qrBox.y + qrBox.h;
    if (inQr) continue;

    const isNeutral = cell.chroma < 16 && cell.hsv.s < 0.18;
    const isMidTone = cell.lab.l >= 45 && cell.lab.l <= 92;

    if (isNeutral && isMidTone) {
      mask[i] = 1;
    }
  }

  // 4. Find connected components of candidate neutral cells
  const components = connectedComponents(mask, g.gw, g.gh);
  if (!components.length) {
    return { found: false, box: null, color: null, confidence: 0, reason: 'no_neutral_reference_region_found' };
  }

  // 5. Score and filter candidates
  const candidates = [];
  for (const comp of components) {
    const compW = (comp.maxX - comp.minX + 1) * g.cellW;
    const compH = (comp.maxY - comp.minY + 1) * g.cellH;
    const compX = g.regionX0 + comp.minX * g.cellW;
    const compY = g.regionY0 + comp.minY * g.cellH;
    const box = { x: compX, y: compY, w: compW, h: compH };

    const boxArea = compW * compH;
    const fillRatio = (comp.count * g.cellW * g.cellH) / boxArea;
    const areaRatio = boxArea / (regionW * regionH);

    // Minimum size requirements: at least 10px wide and 18px tall
    if (compW < 10 || compH < 18) continue;
    // Fill ratio must be relatively solid
    if (fillRatio < 0.45) continue;
    // Reject components that are too huge (e.g. if the entire background was neutral)
    if (areaRatio > 0.45) continue;
    // Reject if it overlaps heavily with sensingRoi (if sensingRoi is provided)
    if (sensingRoi && computeIoU(box, sensingRoi) > 0.3) continue;

    // Calculate mean color of this candidate
    let rSum = 0, gSum = 0, bSum = 0;
    for (const cellIdx of comp.cells) {
      const c = g.grid[cellIdx];
      rSum += c.r;
      gSum += c.g;
      bSum += c.b;
    }
    const n = comp.cells.length;
    const meanR = rSum / n;
    const meanG = gSum / n;
    const meanB = bSum / n;
    const lab = rgbToLab(meanR, meanG, meanB);
    const chroma = Math.sqrt(lab.a * lab.a + lab.b * lab.b);

    // Confidence scoring based on neutrality, fill, aspect ratio, and the
    // expected CAD position beside the sensing strip. The spatial prior is
    // deliberately soft so older badge layouts continue to use color evidence.
    const neutralityScore = Math.max(0, 1 - chroma / 16);
    const fillScore = Math.min(1, fillRatio / 0.7);
    const aspect = compH / compW;
    const aspectScore = aspect >= 0.5 && aspect <= 6.0 ? 1 : 0.6;
    let spatialScore = 0.5;
    if (sensingRoi) {
      const expectedX = sensingRoi.x + sensingRoi.w * 1.19;
      const expectedY = sensingRoi.y + sensingRoi.h * 0.5;
      const candidateX = box.x + box.w * 0.5;
      const candidateY = box.y + box.h * 0.5;
      const normalizer = Math.max(12, sensingRoi.w, sensingRoi.h);
      const distance = Math.hypot(candidateX - expectedX, candidateY - expectedY) / normalizer;
      spatialScore = Math.max(0, 1 - distance / 1.5);
    }

    const confidence = sensingRoi
      ? 0.32 * neutralityScore + 0.30 * fillScore + 0.13 * aspectScore + 0.25 * spatialScore
      : 0.4 * neutralityScore + 0.4 * fillScore + 0.2 * aspectScore;

    candidates.push({
      box,
      color: { r: Math.round(meanR), g: Math.round(meanG), b: Math.round(meanB) },
      confidence,
      area: boxArea,
      chroma,
      spatialScore,
    });
  }

  if (!candidates.length) {
    return { found: false, box: null, color: null, confidence: 0, reason: 'no_candidate_matched_reference_profile' };
  }

  // Sort by confidence
  candidates.sort((a, b) => b.confidence - a.confidence);
  const best = candidates[0];

  if (best.confidence < 0.4) {
    return { found: false, box: best.box, color: best.color, confidence: best.confidence, reason: 'low_confidence_reference_patch' };
  }

  return {
    found: true,
    box: best.box,
    color: best.color,
    confidence: best.confidence,
    reason: 'ok',
  };
}

/**
 * Prototype reference target RGB [R, G, B].
 * NOTE: This is a prototype target requiring experimental calibration against
 * physical spectrophotometer readings under standard D65 illumination.
 */
export const TARGET_REFERENCE_RGB = [128, 128, 128];

/**
 * Apply per-channel multiplicative optical correction using reference patch RGB.
 *
 * gain = target / observedReference
 * correctedH2S = observedH2S * gain
 *
 * Clamps output RGB to 0-255 and handles zero or invalid reference channels safely.
 *
 * @param {{r: number, g: number, b: number}} observedH2SRgb
 * @param {{r: number, g: number, b: number}} observedRefRgb
 * @param {[number, number, number]} [targetRgb=TARGET_REFERENCE_RGB]
 * @returns {{
 *   success: boolean,
 *   gain: { r: number, g: number, b: number } | null,
 *   targetRgb: [number, number, number],
 *   observedReferenceRgb: { r: number, g: number, b: number } | null,
 *   correctedH2SRgb: { r: number, g: number, b: number } | null,
 *   error?: string
 * }}
 */
export function applyOpticalCorrection(observedH2SRgb, observedRefRgb, targetRgb = TARGET_REFERENCE_RGB) {
  if (!observedH2SRgb || !observedRefRgb) {
    return {
      success: false,
      gain: null,
      targetRgb,
      observedReferenceRgb: observedRefRgb || null,
      correctedH2SRgb: null,
      error: 'Missing H2S or reference RGB data for optical correction.',
    };
  }

  const obsR = Number(observedRefRgb.r);
  const obsG = Number(observedRefRgb.g);
  const obsB = Number(observedRefRgb.b);

  if (!Number.isFinite(obsR) || obsR <= 0 ||
      !Number.isFinite(obsG) || obsG <= 0 ||
      !Number.isFinite(obsB) || obsB <= 0) {
    return {
      success: false,
      gain: null,
      targetRgb,
      observedReferenceRgb: observedRefRgb,
      correctedH2SRgb: null,
      error: 'Invalid reference patch RGB channels (zero or non-finite).',
    };
  }

  const gainR = targetRgb[0] / obsR;
  const gainG = targetRgb[1] / obsG;
  const gainB = targetRgb[2] / obsB;

  const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));

  const correctedH2SRgb = {
    r: clamp(observedH2SRgb.r * gainR),
    g: clamp(observedH2SRgb.g * gainG),
    b: clamp(observedH2SRgb.b * gainB),
  };

  return {
    success: true,
    gain: { r: gainR, g: gainG, b: gainB },
    targetRgb,
    observedReferenceRgb: { r: obsR, g: obsG, b: obsB },
    correctedH2SRgb,
  };
}

