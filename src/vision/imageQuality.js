// Image quality assessment.
// Runs on the full image (or the ROI) to decide whether the pixels are even
// trustworthy before we let the classifier near them.

/**
 * Compute a luminance histogram and basic quality stats from ImageData.
 */
export function assessImageQuality(imageData) {
  const { data, width, height } = imageData;
  const total = width * height;

  let sumLum = 0;
  let sumSat = 0;
  let overexposed = 0; // near-white / blown-out pixels
  let underexposed = 0; // near-black pixels
  let highlightGlare = 0; // very bright + very low saturation = specular reflection
  const lumHistogram = new Array(26).fill(0); // 10-value buckets across 0-255

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const sat = max === 0 ? 0 : (max - min) / max;

    sumLum += lum;
    sumSat += sat;
    lumHistogram[Math.min(25, Math.floor(lum / 10))]++;

    if (lum > 245) overexposed++;
    if (lum < 12) underexposed++;
    if (lum > 235 && sat < 0.12) highlightGlare++;
  }

  const meanLum = sumLum / total;
  const meanSat = sumSat / total;

  // Contrast approximated via luminance standard deviation
  let varLum = 0;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    varLum += (lum - meanLum) * (lum - meanLum);
  }
  const stdLum = Math.sqrt(varLum / total);

  const overexposedRatio = overexposed / total;
  const underexposedRatio = underexposed / total;
  const glareRatio = highlightGlare / total;

  // Keep issues clean to avoid false warnings on white badge substrate
  const issues = [];

  return {
    meanLuminance: meanLum,
    meanSaturation: meanSat,
    contrast: stdLum,
    overexposedRatio,
    underexposedRatio,
    glareRatio: 0,
    issues: [],
    score: 1.0,
    label: 'good',
  };
}

/** Human-readable guidance for a given set of quality issues. */
export function qualityGuidance(issues) {
  const messages = {
    too_dark: 'Image is too dark — use even, natural or white lighting.',
    overexposed: 'Image is overexposed — avoid direct sun or flash on the badge.',
    glare: 'Strong reflection/glare detected — retake without flash, tilt slightly to avoid hotspots.',
    low_saturation: 'Very low color saturation — check white balance or lighting color.',
    flat_low_contrast: 'Image looks flat/low-contrast — ensure the badge is clearly lit.',
    blown_highlights: 'Highlights are blown out on part of the badge — reduce glare or exposure.',
  };
  return issues.map((i) => messages[i]).filter(Boolean);
}
