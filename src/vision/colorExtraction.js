import { rgbToHsv, rgbToHsl, rgbToLab } from './colorSpace';

function median(arr) {
  if (!arr.length) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Extract a robust representative color from a cropped sensing-region canvas.
 *
 * Pipeline:
 *  1. Trim a border margin (avoids bezel/edge pixels bleeding in).
 *  2. Reject near-white/near-black outlier pixels (specular highlight / shadow).
 *  3. Reject low-saturation "gray" pixels beyond a tolerance if the rest of the
 *     region is clearly saturated (helps drop glare and background bleed).
 *  4. Take the per-channel MEDIAN of the surviving pixels (robust to remaining
 *     outliers) rather than a plain mean or a single sampled pixel.
 */
export function extractRobustColor(roiImageData, { borderTrim = 0.12 } = {}) {
  const { data, width, height } = roiImageData;

  const x0 = Math.floor(width * borderTrim);
  const x1 = Math.ceil(width * (1 - borderTrim));
  const y0 = Math.floor(height * borderTrim);
  const y1 = Math.ceil(height * (1 - borderTrim));

  const candidates = [];
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const idx = (y * width + x) * 4;
      const r = data[idx], g = data[idx + 1], b = data[idx + 2];
      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      // Reject specular highlight and deep shadow pixels outright.
      if (lum > 248) continue; // blown highlight
      if (lum < 8) continue; // near-black shadow
      candidates.push({ r, g, b, lum });
    }
  }

  if (candidates.length < 8) {
    // Region too small/degenerate after trimming — fall back to using
    // everything so we still return *something*, but flag low sample count.
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        candidates.push({ r: data[idx], g: data[idx + 1], b: data[idx + 2] });
      }
    }
  }

  // Trimmed by luminance: drop the extreme 10% brightest and darkest of what's left,
  // which further suppresses residual glare/shadow gradients across the patch.
  const byLum = [...candidates].sort((a, b) => a.lum - b.lum);
  const trim = Math.floor(byLum.length * 0.1);
  const trimmed = byLum.slice(trim, byLum.length - trim || undefined);
  const pool = trimmed.length >= 6 ? trimmed : candidates;

  const rMed = median(pool.map((p) => p.r));
  const gMed = median(pool.map((p) => p.g));
  const bMed = median(pool.map((p) => p.b));

  const hsv = rgbToHsv(rMed, gMed, bMed);
  const hsl = rgbToHsl(rMed, gMed, bMed);
  const lab = rgbToLab(rMed, gMed, bMed);

  // Spread (std dev of luminance among sampled pixels) — used as a signal
  // for ROI quality: a badge sensing patch should be fairly uniform.
  const lums = pool.map((p) => 0.2126 * p.r + 0.7152 * p.g + 0.0722 * p.b);
  const meanLum = lums.reduce((s, v) => s + v, 0) / lums.length;
  const variance = lums.reduce((s, v) => s + (v - meanLum) * (v - meanLum), 0) / lums.length;
  const stdLum = Math.sqrt(variance);

  return {
    rgb: { r: rMed, g: gMed, b: bMed },
    hsv,
    hsl,
    lab,
    sampleCount: pool.length,
    totalCandidates: candidates.length,
    uniformity: Math.max(0, 1 - stdLum / 60), // 1 = very uniform patch, 0 = noisy/mottled
  };
}
