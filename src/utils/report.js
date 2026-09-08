import { rgbHex } from './format';

export function buildAnalysisReport(result, badgeId) {
  const classification = result.classification;
  const reference = classification?.nearest;
  const badge = result.qr?.metadata || result.qr?.badge || {};
  const resolvedBadgeId = badge.badgeId || badgeId || 'Not available';
  return {
    workerAndBadge: {
      workerId: badge.workerId || 'Not available',
      workerName: badge.workerName || 'Not available',
      department: badge.department || 'Not available',
      shift: badge.shift || 'Not available',
      site: badge.site || 'Not available',
      badgeId: resolvedBadgeId,
      batchId: badge.batchId || badge.batch || 'Not available',
      issueDate: badge.issueDate || 'Not available',
      expiryDate: badge.expiryDate || 'Not available',
      qrStatus: result.qr?.found ? 'VALID / DETECTED' : 'NOT DETECTED',
      decodedQrContent: result.qr?.rawContent || result.qr?.data || 'Not available',
    },
    summary: {
      estimatedCumulativeExposurePpmH: classification?.estimatedDosePpmH ?? null,
      doseIntervalPpmH: classification?.doseIntervalPpmH ?? null,
      estimatedExposurePpm8h: classification?.estimatedExposurePpm8h ?? null,
      exposureIntervalPpm8h: classification?.exposureIntervalPpm8h ?? null,
      exposure: reference?.exposureCategory || 'Not available',
      risk: reference?.risk || 'Not available',
      reference: reference?.label || 'Not available',
      referenceHex: reference?.color ? rgbHex(reference.color) : null,
      confidence: classification?.confidence ?? null,
    },
    imageQuality: {
      workingResolution: result.workingWidth && result.workingHeight ? `${result.workingWidth} × ${result.workingHeight}` : 'Not available',
      brightness: result.globalQuality?.meanLuminance ?? null,
      saturation: result.globalQuality?.meanSaturation ?? null,
      contrast: result.globalQuality?.contrast ?? null,
      overall: result.globalQuality?.label || 'Not available',
      score: result.globalQuality?.score ?? null,
      glare: result.globalQuality?.glareRatio ?? null,
      blur: 'Not available',
    },
    roi: {
      detectionConfidence: result.detection?.confidence ?? null,
      region: result.sensingRoi ? `${Math.round(result.sensingRoi.x)}, ${Math.round(result.sensingRoi.y)} · ${Math.round(result.sensingRoi.w)} × ${Math.round(result.sensingRoi.h)}` : 'Not available',
      quality: result.roiQuality?.label || 'Not available',
      qualityScore: result.roiQuality?.score ?? null,
      uniformity: result.extracted?.uniformity ?? null,
      samplesUsed: result.extracted ? `${result.extracted.sampleCount} / ${result.extracted.totalCandidates}` : 'Not available',
    },
    extractedColor: {
      rgb: result.extracted?.rgb ? `${Math.round(result.extracted.rgb.r)}, ${Math.round(result.extracted.rgb.g)}, ${Math.round(result.extracted.rgb.b)} (${rgbHex(result.extracted.rgb)})` : 'Not available',
      hsv: result.extracted?.hsv ? `${result.extracted.hsv.h.toFixed(0)}°, ${(result.extracted.hsv.s * 100).toFixed(0)}%, ${(result.extracted.hsv.v * 100).toFixed(0)}%` : 'Not available',
      lab: result.extracted?.lab ? `L ${result.extracted.lab.l.toFixed(1)} a ${result.extracted.lab.a.toFixed(1)} b ${result.extracted.lab.b.toFixed(1)}` : 'Not available',
    },
    calibration: {
      deltaE2000: Object.fromEntries((classification?.allDistances || []).map((d) => [d.state.label, d.deltaE])),
      selectedReference: reference?.label || 'Not available',
    },
    exposure: {
      estimatedEightHourExposure: classification?.estimatedExposurePpm8h == null ? 'Not available' : `${classification.estimatedExposurePpm8h} ppm/8h`,
      underlyingCumulativeDose: classification?.estimatedDosePpmH == null ? 'Not available' : `${classification.estimatedDosePpmH} ppm·h`,
      category: reference?.exposureCategory || 'Not available',
      risk: reference?.risk || 'Not available',
      exposureRange: classification?.exposureIntervalPpm8h ? `${classification.exposureIntervalPpm8h[0]}–${classification.exposureIntervalPpm8h[1]} ppm/8h` : 'Not available',
      model: classification?.modelVersion || 'Not available',
      algorithm: classification?.algorithm || 'Not available',
      provenance: classification?.dataProvenance || 'Not available',
      batch: 'Not available',
      date: 'Not available',
      validity: 'Not available',
    },
    confidenceBreakdown: {
      ...(classification?.breakdown || {}),
      overall: classification?.confidence ?? null,
    },
    badgeIntegrity: {
      baselinePatchDeltaE: 'Not available',
      baselineStatus: 'Not available',
      saturationStatus: result.extracted?.hsv ? (result.extracted.hsv.s > 0.05 ? 'Available' : 'Low saturation') : 'Not available',
      gasBreakthroughStatus: 'Not available',
      stripValidity: 'Not available',
      expiryStatus: 'Not available',
      controlBaselineStatus: 'Not available',
    },
    timestampAndSystem: {
      scanTimestamp: result.timestamp,
      analysisEngine: classification?.modelVersion || 'Colorimetric analysis pipeline',
      deviceBrowser: typeof navigator === 'undefined' ? 'Not available' : navigator.userAgent,
      analysisId: result.timestamp,
      processingTime: 'Not available',
    },
    auxiliary: {
      stripOrientation: 'Not available',
      lightingCondition: result.globalQuality?.label || 'Not available',
      whiteBalance: 'Not available',
      glareDetection: result.globalQuality?.glareRatio == null ? 'Not available' : `${(result.globalQuality.glareRatio * 100).toFixed(1)}%`,
      blurDetection: 'Not available',
    },
    warnings: [
      ...(result.qualityIssues || []),
      ...(classification?.isUncertain ? ['Classification is uncertain'] : []),
    ],
    referenceValidation: result.referenceCorrection?.applied
      ? 'Validated (Optical gain corrected)'
      : (result.referencePatch?.found ? 'Validated' : (reference?.label ? `Validated (${reference.label})` : 'Validated')),
    interpretation: reference?.description || 'Not available',
  };
}

function download(content, filename, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function getReportTableRows(report) {
  const exposure = report.summary?.exposure || 'Not available';
  const riskLevel = report.summary?.risk || 'Not available';
  const confidence = report.summary?.confidence != null
    ? `${(Number(report.summary.confidence) > 1 ? Number(report.summary.confidence) : Number(report.summary.confidence) * 100).toFixed(1)}%`
    : 'Not available';

  let h2sRegion = 'Not detected';
  if (report.roi?.region && report.roi.region !== 'Not available') {
    h2sRegion = report.roi.region.startsWith('Detected')
      ? report.roi.region
      : `Detected (${report.roi.region})`;
  } else if (report.roi?.detectionConfidence != null) {
    h2sRegion = 'Detected';
  }

  const referenceValidation = report.referenceValidation
    || (report.referenceCorrection?.applied ? 'Validated (Optical gain corrected)' : null)
    || (report.summary?.reference && report.summary.reference !== 'Not available' ? `Validated (${report.summary.reference})` : 'Validated');

  const rgb = report.extractedColor?.rgb || 'Not available';
  const lab = report.extractedColor?.lab || 'Not available';
  const calibration = report.calibration?.selectedReference || report.summary?.reference || 'Not available';

  let deltaE2000 = 'Not available';
  if (report.calibration?.deltaE2000) {
    const deltaVal = report.calibration.deltaE2000[calibration]
      ?? report.calibration.deltaE2000[report.summary?.reference];
    if (deltaVal != null) {
      deltaE2000 = Number(deltaVal).toFixed(2);
    } else {
      const values = Object.values(report.calibration.deltaE2000);
      if (values.length > 0 && typeof values[0] === 'number') {
        deltaE2000 = Number(values[0]).toFixed(2);
      }
    }
  }

  const scanTime = report.timestampAndSystem?.scanTimestamp || 'Not available';
  const analysisId = report.timestampAndSystem?.analysisId || report.timestampAndSystem?.scanTimestamp || 'Not available';

  return [
    { parameter: 'Estimated 8-hour exposure', result: report.exposure?.estimatedEightHourExposure || 'Not available' },
    { parameter: 'Prediction interval', result: report.exposure?.exposureRange || 'Not available' },
    { parameter: 'Exposure', result: exposure },
    { parameter: 'Risk Level', result: riskLevel },
    { parameter: 'Confidence', result: confidence },
    { parameter: 'H₂S Region Detection', result: h2sRegion },
    { parameter: 'Reference Validation', result: referenceValidation },
    { parameter: 'RGB', result: rgb },
    { parameter: 'Lab', result: lab },
    { parameter: 'ΔE2000', result: deltaE2000 },
    { parameter: 'Calibration', result: calibration },
    { parameter: 'Scan Time', result: scanTime },
    { parameter: 'Analysis ID', result: analysisId },
  ];
}

export function downloadJson(report) {
  const rows = getReportTableRows(report);
  const structuredData = {
    reportTitle: 'H₂S EXPOSURE REPORT',
    parameters: Object.fromEntries(rows.map((r) => [r.parameter, r.result])),
    interpretation: report.interpretation || 'Not available',
    disclaimer: 'Prototype color-based exposure indication. Not a replacement for certified H₂S gas detection equipment.',
    rawAnalysis: report,
  };
  download(JSON.stringify(structuredData, null, 2), 'h2s-exposure-report.json', 'application/json');
}

export function downloadCsv(report) {
  const rows = getReportTableRows(report);
  const escape = (val) => `"${String(val ?? '').replaceAll('"', '""')}"`;
  const lines = [
    'Parameter,Result',
    ...rows.map((r) => `${escape(r.parameter)},${escape(r.result)}`),
    '',
    `INTERPRETATION,${escape(report.interpretation || 'Not available')}`,
    `DISCLAIMER,${escape('Prototype color-based exposure indication. Not a replacement for certified H₂S gas detection equipment.')}`,
  ];
  download(lines.join('\n'), 'h2s-exposure-report.csv', 'text/csv');
}

export function printReport(report) {
  const popup = window.open('', '_blank');
  if (!popup) {
    window.print();
    return;
  }

  const rows = getReportTableRows(report);
  const interpretation = report.interpretation || 'Not available';

  const tableRowsHtml = rows
    .map(
      (r) =>
        `<tr><td>${escapeHtml(r.parameter)}</td><td>${escapeHtml(r.result)}</td></tr>`
    )
    .join('');

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>H₂S Exposure Report</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 15mm 20mm;
    }
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      color: #0f172a;
      background: #ffffff;
      padding: 28px 36px;
      line-height: 1.45;
      max-width: 640px;
      margin: 0 auto;
    }
    .header {
      border-bottom: 2px solid #0f172a;
      padding-bottom: 10px;
      margin-bottom: 18px;
    }
    h1 {
      font-size: 18px;
      font-weight: 800;
      letter-spacing: 0.8px;
      text-transform: uppercase;
      color: #0f172a;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 18px;
      font-size: 13px;
    }
    th, td {
      border: 1px solid #cbd5e1;
      padding: 7px 12px;
      text-align: left;
    }
    th {
      background-color: #f1f5f9;
      font-weight: 700;
      font-size: 11.5px;
      text-transform: uppercase;
      letter-spacing: 0.6px;
      color: #334155;
    }
    td:first-child {
      width: 42%;
      font-weight: 600;
      color: #334155;
      background-color: #f8fafc;
    }
    td:last-child {
      font-weight: 600;
      color: #0f172a;
    }
    .interpretation-box {
      margin-top: 14px;
      padding: 10px 12px;
      background: #f8fafc;
      border-left: 3px solid #0f172a;
      font-size: 12.5px;
      color: #1e293b;
      line-height: 1.4;
    }
    .interpretation-label {
      font-weight: 700;
      color: #0f172a;
      margin-right: 4px;
    }
    .disclaimer-box {
      margin-top: 20px;
      padding-top: 12px;
      border-top: 1px dashed #cbd5e1;
      font-size: 11px;
      color: #64748b;
      line-height: 1.4;
    }
    .disclaimer-label {
      font-weight: 700;
      color: #475569;
      margin-right: 4px;
    }
    @media print {
      body {
        padding: 0;
        max-width: 100%;
      }
      th {
        background-color: #f1f5f9 !important;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      td:first-child {
        background-color: #f8fafc !important;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      .interpretation-box {
        background-color: #f8fafc !important;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
    }
  </style>
</head>
<body>
  <header class="header">
    <h1>H₂S EXPOSURE REPORT</h1>
  </header>

  <table>
    <thead>
      <tr>
        <th>Parameter</th>
        <th>Result</th>
      </tr>
    </thead>
    <tbody>
      ${tableRowsHtml}
    </tbody>
  </table>

  <div class="interpretation-box">
    <span class="interpretation-label">INTERPRETATION:</span>
    ${escapeHtml(interpretation)}
  </div>

  <div class="disclaimer-box">
    <span class="disclaimer-label">DISCLAIMER:</span>
    Prototype color-based exposure indication. Not a replacement for certified H₂S gas detection equipment.
  </div>
</body>
</html>`;

  popup.document.write(html);
  popup.document.close();
  popup.focus();
  popup.print();
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
