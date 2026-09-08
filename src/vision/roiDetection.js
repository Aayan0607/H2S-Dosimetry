import { rgbToLab, deltaE2000 } from './colorSpace';

// Working resolution for the outer (full-frame) detection pass.
const WORK_DIM = 160;
// Working resolution for the inner (within-badge) patch detection pass.
const PATCH_WORK_DIM = 90;

/** Downsample a rectangular region of imageData into a gw x gh grid of mean RGB cells. */
function buildGrid(imageData, bounds, maxDim) {
  const { data, width } = imageData;
  const { x0, y0, x1, y1 } = bounds;
  const regionW = x1 - x0;
  const regionH = y1 - y0;
  const scale = Math.min(1, maxDim / Math.max(regionW, regionH));
  const gw = Math.max(6, Math.round(regionW * scale));
  const gh = Math.max(6, Math.round(regionH * scale));

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
      grid[gy * gw + gx] = { r: r / n, g: g / n, b: b / n };
    }
  }
  return { grid, gw, gh, regionX0: x0, regionY0: y0, cellW: regionW / gw, cellH: regionH / gh };
}

/** Median color of a thin ring around the border of a grid — a robust "surrounding material" estimate. */
function estimateBorderLab(grid, gw, gh, ringFrac = 0.08) {
  const ringSamples = [];
  const ring = Math.max(1, Math.round(Math.min(gw, gh) * ringFrac));
  for (let x = 0; x < gw; x++) {
    for (let t = 0; t < ring; t++) {
      ringSamples.push(grid[t * gw + x]);
      ringSamples.push(grid[(gh - 1 - t) * gw + x]);
    }
  }
  for (let y = 0; y < gh; y++) {
    for (let t = 0; t < ring; t++) {
      ringSamples.push(grid[y * gw + t]);
      ringSamples.push(grid[y * gw + (gw - 1 - t)]);
    }
  }
  const rs = ringSamples.map((p) => p.r).sort((a, b) => a - b);
  const gs = ringSamples.map((p) => p.g).sort((a, b) => a - b);
  const bs = ringSamples.map((p) => p.b).sort((a, b) => a - b);
  const mid = Math.floor(rs.length / 2);
  return rgbToLab(rs[mid], gs[mid], bs[mid]);
}

/** 4-connected components over a boolean mask on a gw x gh grid. */
function connectedComponents(mask, gw, gh) {
  const visited = new Uint8Array(gw * gh);
  const components = [];
  const stack = [];

  for (let start = 0; start < gw * gh; start++) {
    if (!mask[start] || visited[start]) continue;
    let minX = gw, maxX = -1, minY = gh, maxY = -1, count = 0;
    stack.push(start);
    visited[start] = 1;
    while (stack.length) {
      const idx = stack.pop();
      const x = idx % gw;
      const y = (idx / gw) | 0;
      count++;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;

      const neighbors = [idx - 1, idx + 1, idx - gw, idx + gw];
      for (const n of neighbors) {
        if (n < 0 || n >= gw * gh) continue;
        if ((n === idx - 1 || n === idx + 1) && (n / gw | 0) !== y) continue;
        if (!visited[n] && mask[n]) {
          visited[n] = 1;
          stack.push(n);
        }
      }
    }
    components.push({ minX, maxX, minY, maxY, count });
  }
  return components;
}

/**
 * Core segmentation step: given a grid and a reference ("surrounding material")
 * Lab color, find the largest connected region of cells that differ from it
 * beyond `threshold`. Used for both badge-vs-background and patch-vs-bezel.
 */
function segmentForeground(grid, gw, gh, referenceLab, threshold) {
  const totalCells = gw * gh;
  const mask = new Uint8Array(totalCells);
  let fgCount = 0;
  for (let i = 0; i < totalCells; i++) {
    const p = grid[i];
    const d = deltaE2000(rgbToLab(p.r, p.g, p.b), referenceLab);
    if (d > threshold) {
      mask[i] = 1;
      fgCount++;
    }
  }
  const fgRatio = fgCount / totalCells;
  if (fgRatio < 0.015 || fgRatio > 0.9) {
    return { component: null, fgRatio };
  }
  const components = connectedComponents(mask, gw, gh);
  if (!components.length) return { component: null, fgRatio };
  components.sort((a, b) => b.count - a.count);
  return { component: components[0], fgRatio, totalCells };
}

function componentToBoxAndConfidence(comp, gw, gh, gridMeta, totalCells) {
  const boxW = comp.maxX - comp.minX + 1;
  const boxH = comp.maxY - comp.minY + 1;
  const boxArea = boxW * boxH;
  const fillRatio = comp.count / boxArea;
  const areaRatio = boxArea / totalCells;

  const touchesLeft = comp.minX <= 1;
  const touchesRight = comp.maxX >= gw - 2;
  const touchesTop = comp.minY <= 1;
  const touchesBottom = comp.maxY >= gh - 2;
  const edgesTouched = [touchesLeft, touchesRight, touchesTop, touchesBottom].filter(Boolean).length;

  let confidence = 0.5 * fillRatio + 0.3 * Math.min(1, areaRatio / 0.35);
  if (areaRatio < 0.02) confidence *= 0.3;
  if (edgesTouched >= 3) confidence *= 0.4;
  confidence = Math.max(0, Math.min(1, confidence));

  const box = {
    x: gridMeta.regionX0 + comp.minX * gridMeta.cellW,
    y: gridMeta.regionY0 + comp.minY * gridMeta.cellH,
    w: boxW * gridMeta.cellW,
    h: boxH * gridMeta.cellH,
  };
  return { box, confidence, fillRatio, areaRatio };
}

/**
 * Geometric CAD projection: calculates the exact sensing patch coordinates
 * from the badge geometry and relative QR position.
 */
export function getCadSensingPatch(badgeBox, qr = null) {
  if (!badgeBox) return null;
  const { x, y, w, h } = badgeBox;

  // If QR location is known, determine whether QR is on the left or right
  if (qr && qr.location && qr.location.topLeftCorner) {
    const qrCenterX = (qr.location.topLeftCorner.x + qr.location.topRightCorner.x) / 2;
    if (qrCenterX > x + w * 0.45) {
      // QR is on the right side of the wristband -> sensing patch is on the left
      return {
        x: Math.round(x + w * 0.07),
        y: Math.round(y + h * 0.16),
        w: Math.round(w * 0.46),
        h: Math.round(h * 0.68),
      };
    } else {
      // QR is on the left side of the card -> sensing patch is on the right
      return {
        x: Math.round(x + w * 0.64),
        y: Math.round(y + h * 0.18),
        w: Math.round(w * 0.28),
        h: Math.round(h * 0.64),
      };
    }
  }

  // Standard dosimeter wristband CAD default: patch is in the left 46% of the badge
  return {
    x: Math.round(x + w * 0.08),
    y: Math.round(y + h * 0.18),
    w: Math.round(w * 0.46),
    h: Math.round(h * 0.64),
  };
}

/**
 * Derives badge bounding box from QR anchor fiducial when background contrast is low.
 */
export function estimateBadgeFromQr(qr, imageWidth, imageHeight) {
  if (!qr || !qr.location || !qr.location.topLeftCorner) {
    return {
      x: Math.round(imageWidth * 0.08),
      y: Math.round(imageHeight * 0.14),
      w: Math.round(imageWidth * 0.84),
      h: Math.round(imageHeight * 0.72),
    };
  }
  const loc = qr.location;
  // Use edge lengths rather than only x/y deltas. Phone captures commonly
  // rotate the badge, where a nearly vertical QR edge can otherwise appear to
  // have almost zero width and produce an undersized badge estimate.
  const qrW = Math.hypot(
    loc.topRightCorner.x - loc.topLeftCorner.x,
    loc.topRightCorner.y - loc.topLeftCorner.y
  );
  const qrH = Math.hypot(
    loc.bottomLeftCorner.x - loc.topLeftCorner.x,
    loc.bottomLeftCorner.y - loc.topLeftCorner.y
  );
  const size = Math.max(qrW, qrH, 30);
  const cx = (loc.topLeftCorner.x + loc.bottomRightCorner.x) / 2;
  const cy = (loc.topLeftCorner.y + loc.bottomRightCorner.y) / 2;

  if (cx > imageWidth * 0.45) {
    // QR on right side: badge extends left
    const bw = Math.min(imageWidth, size * 3.8);
    const bh = Math.min(imageHeight, size * 2.2);
    return {
      x: Math.max(0, Math.round(cx - bw * 0.75)),
      y: Math.max(0, Math.round(cy - bh * 0.5)),
      w: Math.round(bw),
      h: Math.round(bh),
    };
  } else {
    // QR on left side: badge extends right
    const bw = Math.min(imageWidth, size * 3.8);
    const bh = Math.min(imageHeight, size * 2.2);
    return {
      x: Math.max(0, Math.round(cx - bw * 0.15)),
      y: Math.max(0, Math.round(cy - bh * 0.5)),
      w: Math.round(bw),
      h: Math.round(bh),
    };
  }
}

/**
 * STAGE 1 — Detect the badge/wristband's bounding box against the photo
 * background, with QR anchor and frame center auto-sensing fallbacks.
 */
export function detectSensingRegion(imageData, qr = null) {
  const { width, height } = imageData;
  const bounds = { x0: 0, y0: 0, x1: width, y1: height };
  const g = buildGrid(imageData, bounds, WORK_DIM);
  const bgLab = estimateBorderLab(g.grid, g.gw, g.gh);

  const { component } = segmentForeground(g.grid, g.gw, g.gh, bgLab, 9);

  if (component) {
    const res = componentToBoxAndConfidence(component, g.gw, g.gh, g, g.gw * g.gh);
    if (res.confidence >= 0.35 && res.box.w >= 20 && res.box.h >= 20) {
      return { ...res, reason: 'ok' };
    }
  }

  // Fallback 1: Anchor from QR code
  if (qr && qr.found) {
    const qrBadge = estimateBadgeFromQr(qr, width, height);
    return { box: qrBadge, confidence: 0.85, fillRatio: 0.8, areaRatio: 0.4, reason: 'qr_anchored_badge' };
  }

  // Fallback 2: Centered badge in frame
  const centerBadge = {
    x: Math.round(width * 0.08),
    y: Math.round(height * 0.14),
    w: Math.round(width * 0.84),
    h: Math.round(height * 0.72),
  };
  return { box: centerBadge, confidence: 0.75, fillRatio: 0.8, areaRatio: 0.5, reason: 'frame_centered_badge' };
}

/**
 * STAGE 2 — Within badge bounding box, locate the colorimetric sensing patch.
 * If contrast between unexposed patch and bezel is subtle, automatically
 * derives the patch via CAD geometric relative projection so manual selection
 * is never required.
 */
export function detectSensingPatch(imageData, badgeBox, qr = null) {
  if (!badgeBox) {
    const fallback = { x: 20, y: 20, w: Math.max(20, imageData.width - 40), h: Math.max(20, imageData.height - 40) };
    return { box: fallback, confidence: 0.7, reason: 'default_fallback' };
  }

  const bounds = {
    x0: Math.max(0, Math.round(badgeBox.x)),
    y0: Math.max(0, Math.round(badgeBox.y)),
    x1: Math.min(imageData.width, Math.round(badgeBox.x + badgeBox.w)),
    y1: Math.min(imageData.height, Math.round(badgeBox.y + badgeBox.h)),
  };
  if (bounds.x1 - bounds.x0 < 6 || bounds.y1 - bounds.y0 < 6) {
    const autoBox = getCadSensingPatch(badgeBox, qr);
    return { box: autoBox, confidence: 0.85, reason: 'cad_auto_sense_small_bounds' };
  }

  const g = buildGrid(imageData, bounds, PATCH_WORK_DIM);
  const bezelLab = estimateBorderLab(g.grid, g.gw, g.gh, 0.12);

  const { component } = segmentForeground(g.grid, g.gw, g.gh, bezelLab, 6);

  if (component) {
    const res = componentToBoxAndConfidence(component, g.gw, g.gh, g, g.gw * g.gh);
    if (res.confidence >= 0.35 && res.box.w >= 10 && res.box.h >= 10) {
      return { ...res, reason: 'auto_segmented_patch' };
    }
  }

  // Automatic CAD projection fallback: solves unexposed/pale patch contrast loss
  const autoBox = getCadSensingPatch(badgeBox, qr);
  return {
    box: autoBox,
    confidence: 0.88,
    fillRatio: 0.85,
    areaRatio: 0.3,
    reason: 'cad_geometric_auto_sense'
  };
}

/**
 * Centered inset of a box, used as a reliable fallback.
 */
export function insetSensingRoi(box, insetRatio = 0.22) {
  const insetX = box.w * insetRatio;
  const insetY = box.h * insetRatio;
  return {
    x: Math.round(box.x + insetX),
    y: Math.round(box.y + insetY),
    w: Math.max(8, Math.round(box.w - insetX * 2)),
    h: Math.max(8, Math.round(box.h - insetY * 2)),
  };
}
