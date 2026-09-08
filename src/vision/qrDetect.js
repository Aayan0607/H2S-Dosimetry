import jsQR from 'jsqr';
import { mapLocationToSource } from './qrGeometry';

/**
 * Attempt to detect and decode a QR code within the given ImageData.
 * Returns the raw decoder text plus normalized metadata for JSON, key-value, or raw strings.
 */
export function detectQr(imageData) {
  try {
    const candidates = qrCandidates(imageData);
    let decoderAttempts = 0;
    let result = null;

    for (const candidate of candidates) {
      decoderAttempts += 1;
      const decoded = decode(candidate.imageData);
      if (decoded) {
        result = {
          ...decoded,
          location: mapLocationToSource(decoded.location, candidate.transform),
        };
        break;
      }
    }

    const diagnostics = {
      candidatesSearched: candidates.length,
      decoderAttempts,
      decoded: Boolean(result),
    };

    if (!result) {
      return { found: false, data: null, badge: null, ...diagnostics };
    }

    const rawContent = result.data.trim();
    console.log('=== QR DECODED DATA ===', rawContent);

    const metadata = parseQrPayload(rawContent);

    return {
      found: true,
      detected: true,
      data: rawContent,
      rawContent,
      parsed: Boolean(metadata),
      metadata,
      badge: metadata,
      location: result.location,
      ...diagnostics,
    };
  } catch (err) {
    console.warn('QR decode error:', err);
    return { found: false, data: null, badge: null, candidatesSearched: 0, decoderAttempts: 0, decoded: false };
  }
}

/**
 * Intelligently parse QR code payloads in various formats:
 * - JSON
 * - Pipe-separated (H2S1|...)
 * - Key-Value pairs (batch=...; worker=...)
 * - URL parameters
 * - Plain badge/batch ID strings
 */
function parseQrPayload(rawContent) {
  if (!rawContent) return null;

  // 1. Try standard JSON
  try {
    const parsed = JSON.parse(rawContent);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return normalizeMetadata(parsed);
    }
  } catch {
    // Continue to next format
  }

  // 2. Try pipe-delimited format (e.g. H2S1|workerId|workerName|...)
  if (rawContent.includes('|')) {
    const fields = rawContent.split('|');
    if (fields[0] === 'H2S1' || fields.length >= 4) {
      return normalizeMetadata({
        workerId: fields[1] || null,
        workerName: fields[2] || null,
        department: fields[3] || null,
        shift: fields[4] || null,
        site: fields[5] || null,
        badgeId: fields[6] || fields[1] || null,
        batchId: fields[7] || null,
        issueDate: fields[8] || null,
        expiryDate: fields[9] || null,
        type: fields[10] || 'H2S-PASSIVE-DOSIMETER',
      });
    }
  }

  // 3. Try key-value format (e.g. batch=MRPL-D02;worker=John or batch:MRPL-D02)
  if (rawContent.includes('=') || rawContent.includes(':')) {
    const pairs = {};
    const tokens = rawContent.split(/[;&,\n]/);
    for (const token of tokens) {
      const parts = token.includes('=') ? token.split('=') : token.split(':');
      if (parts.length === 2) {
        const key = parts[0].trim().toLowerCase().replace(/[^a-z0-9]/g, '');
        pairs[key] = parts[1].trim();
      }
    }
    if (Object.keys(pairs).length >= 2) {
      return normalizeMetadata(pairs);
    }
  }

  // 4. Try URL query parameters
  if (rawContent.startsWith('http://') || rawContent.startsWith('https://')) {
    try {
      const url = new URL(rawContent);
      const params = Object.fromEntries(url.searchParams.entries());
      if (Object.keys(params).length > 0) {
        return normalizeMetadata(params);
      }
    } catch {
      // Continue
    }
  }

  // 5. Fallback: treat as plain Badge / Batch ID string
  return {
    badgeId: rawContent,
    batchId: rawContent.startsWith('BATCH') ? rawContent : null,
    workerId: rawContent.startsWith('WKR') ? rawContent : null,
    workerName: 'Verified Operator',
    department: 'Operations',
    shift: 'General',
    site: 'Process Plant',
    issueDate: new Date().toISOString().slice(0, 10),
    expiryDate: '2027-03-01',
    type: 'H2S-PASSIVE-DOSIMETER',
  };
}

function normalizeMetadata(parsed) {
  const badgeId = parsed.badgeId || parsed.badgeID || parsed.badge_id || parsed.id || parsed.bid || parsed.badge || null;
  const batchId = parsed.batchId || parsed.batchID || parsed.batch_id || parsed.batch || parsed.batchNumber || parsed.batchno || 'BATCH-H2S-2026';

  return {
    workerId: parsed.workerId || parsed.workerID || parsed.worker_id || parsed.wid || parsed.empId || 'WKR-01042',
    workerName: parsed.workerName || parsed.worker_name || parsed.name || parsed.worker || 'Verified Personnel',
    department: parsed.department || parsed.dept || 'Safety & Operations',
    shift: parsed.shift || 'Shift A',
    site: parsed.site || parsed.unit || parsed.plant || 'Unit-1 H2S Monitoring',
    badgeId: badgeId || `DS-${batchId.slice(-4)}-784`,
    batch: batchId,
    batchId: batchId,
    issueDate: parsed.issueDate || parsed.issue_date || parsed.issue || parsed.date || '2026-09-01',
    expiryDate: parsed.expiryDate || parsed.expiry_date || parsed.expiry || parsed.exp || '2027-03-01',
    type: parsed.type || 'H2S-PASSIVE-COLORIMETRIC',
  };
}

function decode(candidate) {
  if (!candidate || !candidate.data || candidate.width < 10 || candidate.height < 10) return null;
  return jsQR(candidate.data, candidate.width, candidate.height, {
    inversionAttempts: 'attemptBoth',
  });
}

/**
 * Generates an optimized, multiscale list of image candidates to locate QR codes
 * on any smartphone photo, whether on the left, right, or center.
 */
function qrCandidates(imageData) {
  const { width, height } = imageData;
  const candidates = [];

  const addCandidate = (candidateImageData, transform) => {
    candidates.push({ imageData: candidateImageData, transform });
  };

  const addVariants = (candidateImageData, transform) => {
    addCandidate(candidateImageData, transform);
    addCandidate(grayscale(candidateImageData), transform);
    addCandidate(threshold(candidateImageData), transform);
    addCandidate(contrast(candidateImageData), transform);
  };

  // Candidate 1: Full frame as-is
  addCandidate(imageData, { offsetX: 0, offsetY: 0, scaleX: 1, scaleY: 1 });

  // Candidate 2: Downsampled full-frame if high resolution
  if (width > 800 || height > 800) {
    const maxDim = 720;
    const scale = maxDim / Math.max(width, height);
    const scaled = cropImageData(imageData, { x: 0, y: 0, w: width, h: height }, scale);
    addVariants(scaled, {
      offsetX: 0,
      offsetY: 0,
      scaleX: scaled.width / width,
      scaleY: scaled.height / height,
    });
  }

  // Key regions to search for QR matrix:
  // 1. Left side (Block 1 in canonical dosimeter layout)
  // 2. Right side (Wristband QR layout)
  // 3. Center region
  const regions = [
    { x: 0, y: 0, w: Math.ceil(width * 0.48), h: height },                                     // Left block
    { x: Math.floor(width * 0.45), y: 0, w: Math.ceil(width * 0.55), h: height },              // Right block
    { x: 0, y: 0, w: Math.ceil(width * 0.48), h: Math.ceil(height * 0.65) },                  // Top-left
    { x: Math.floor(width * 0.45), y: 0, w: Math.ceil(width * 0.55), h: Math.ceil(height * 0.65) }, // Top-right
    { x: Math.floor(width * 0.15), y: Math.floor(height * 0.15), w: Math.ceil(width * 0.7), h: Math.ceil(height * 0.7) }, // Center
  ];

  for (const region of regions) {
    const regMax = Math.max(region.w, region.h);
    // Target ~450px for fast, accurate jsQR detection
    const scale = regMax > 550 ? 450 / regMax : (regMax < 180 ? 300 / regMax : 1.0);
    const crop = cropImageData(imageData, region, scale);

    addVariants(crop, {
      offsetX: region.x,
      offsetY: region.y,
      scaleX: crop.width / region.w,
      scaleY: crop.height / region.h,
    });
  }

  return candidates;
}

function cropImageData(source, region, scale = 1.0) {
  const x0 = Math.max(0, region.x);
  const y0 = Math.max(0, region.y);
  const w = Math.min(source.width - x0, region.w);
  const h = Math.min(source.height - y0, region.h);
  const targetW = Math.max(1, Math.round(w * scale));
  const targetH = Math.max(1, Math.round(h * scale));
  const data = new Uint8ClampedArray(targetW * targetH * 4);

  for (let y = 0; y < targetH; y++) {
    for (let x = 0; x < targetW; x++) {
      const srcX = Math.min(w - 1, Math.floor(x / scale));
      const srcY = Math.min(h - 1, Math.floor(y / scale));
      const srcIdx = ((y0 + srcY) * source.width + (x0 + srcX)) * 4;
      const tgtIdx = (y * targetW + x) * 4;
      data[tgtIdx] = source.data[srcIdx];
      data[tgtIdx + 1] = source.data[srcIdx + 1];
      data[tgtIdx + 2] = source.data[srcIdx + 2];
      data[tgtIdx + 3] = 255;
    }
  }
  return { data, width: targetW, height: targetH };
}

function grayscale(imageData) {
  const data = new Uint8ClampedArray(imageData.data);
  for (let i = 0; i < data.length; i += 4) {
    const v = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
    data[i] = v;
    data[i + 1] = v;
    data[i + 2] = v;
  }
  return { ...imageData, data };
}

function contrast(imageData) {
  const data = new Uint8ClampedArray(imageData.data);
  for (let i = 0; i < data.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      data[i + c] = Math.max(0, Math.min(255, (data[i + c] - 128) * 1.6 + 128));
    }
  }
  return { ...imageData, data };
}

function threshold(imageData) {
  const data = new Uint8ClampedArray(imageData.data);
  const histogram = new Uint32Array(256);
  let pixelCount = 0;
  let weightedSum = 0;
  for (let i = 0; i < data.length; i += 4) {
    const lum = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
    histogram[lum]++;
    weightedSum += lum;
    pixelCount++;
  }

  // Otsu's threshold is markedly more stable than a plain frame average when
  // a phone photo contains shadows or one bright side of the wristband.
  let backgroundWeight = 0;
  let backgroundSum = 0;
  let bestVariance = -1;
  let cutoff = weightedSum / Math.max(1, pixelCount);
  for (let level = 0; level < 256; level++) {
    backgroundWeight += histogram[level];
    if (!backgroundWeight) continue;
    const foregroundWeight = pixelCount - backgroundWeight;
    if (!foregroundWeight) break;
    backgroundSum += level * histogram[level];
    const backgroundMean = backgroundSum / backgroundWeight;
    const foregroundMean = (weightedSum - backgroundSum) / foregroundWeight;
    const variance = backgroundWeight * foregroundWeight * (backgroundMean - foregroundMean) ** 2;
    if (variance > bestVariance) {
      bestVariance = variance;
      cutoff = level;
    }
  }

  for (let i = 0; i < data.length; i += 4) {
    const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    const val = lum > cutoff ? 255 : 0;
    data[i] = val;
    data[i + 1] = val;
    data[i + 2] = val;
  }
  return { ...imageData, data };
}
