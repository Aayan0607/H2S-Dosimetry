import QRCode from 'qrcode';
import { DEFAULT_CALIBRATION } from '../calibration/calibrationData';

const DEMO_DEFS = [
  { id: 'demo-unexposed', calibrationId: 'unexposed', batch: 'BATCH-0926-CU01', jitter: 4, workerId: 'WKR-00984', workerName: 'Rohit Kumar', department: 'Maintenance', shift: 'Night B', site: 'Unit-3 Sulfur Recovery', badgeId: 'DS-0926-784512' },
  { id: 'demo-low', calibrationId: 'low', batch: 'MRPL-D02', jitter: 6, workerId: 'WKR-00561', workerName: 'Suresh Patel', department: 'Operations', shift: 'Day A', site: 'Unit-2 Process Area' },
  { id: 'demo-moderate', calibrationId: 'moderate', batch: 'MRPL-D03', jitter: 6, workerId: 'WKR-00312', workerName: 'Imran Sheikh', department: 'Maintenance', shift: 'Night B', site: 'Unit-4 Utilities' },
  { id: 'demo-high', calibrationId: 'high', batch: 'MRPL-D04', jitter: 8, workerId: 'WKR-00745', workerName: 'Meera Nair', department: 'Inspection', shift: 'Day B', site: 'Unit-1 Gas Treatment' },
  { id: 'demo-critical', calibrationId: 'critical', batch: 'MRPL-D05', jitter: 8, workerId: 'WKR-00628', workerName: 'Arjun Rao', department: 'Operations', shift: 'Night A', site: 'Unit-5 Compressor House' },
];

function jitterColor({ r, g, b }, amount) {
  const j = () => (Math.random() - 0.5) * 2 * amount;
  return {
    r: Math.max(0, Math.min(255, r + j())),
    g: Math.max(0, Math.min(255, g + j())),
    b: Math.max(0, Math.min(255, b + j())),
  };
}

/**
 * Generate one synthetic-but-realistic demo photo: a hand-held wristband on
 * a plain desk background, slight lighting gradient, a real scannable QR
 * code, and a sensing patch colored near (not exactly, so extraction is
 * genuinely exercised) the target calibration reference.
 */
async function generateDemoImage(def) {
  const calState = DEFAULT_CALIBRATION.find((c) => c.id === def.calibrationId);
  const patchColor = jitterColor(calState.color, def.jitter);

  const width = 800, height = 600;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  // Background: neutral desk surface with a soft lighting gradient (not flat,
  // so the pipeline's normalization/quality logic is meaningfully exercised)
  const grad = ctx.createLinearGradient(0, 0, width, height);
  grad.addColorStop(0, '#cfcac0');
  grad.addColorStop(1, '#a9a49b');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);

  // Subtle background noise/texture
  const bgNoise = ctx.getImageData(0, 0, width, height);
  for (let i = 0; i < bgNoise.data.length; i += 4) {
    const n = (Math.random() - 0.5) * 10;
    bgNoise.data[i] += n;
    bgNoise.data[i + 1] += n;
    bgNoise.data[i + 2] += n;
  }
  ctx.putImageData(bgNoise, 0, 0);

  // Wristband strap
  const bandX = width * 0.12, bandY = height * 0.16, bandW = width * 0.76, bandH = height * 0.6;
  ctx.fillStyle = '#2b2f33';
  roundRect(ctx, bandX, bandY, bandW, bandH, 22);
  ctx.fill();

  const badge = {
    workerId: def.workerId,
    workerName: def.workerName,
    department: def.department,
    shift: def.shift,
    site: def.site,
    badgeId: def.badgeId || `DS-0926-${def.workerId.slice(-4)}`,
    batchId: def.batch,
    issueDate: '2026-09-01',
    expiryDate: '2028-12-31',
    type: 'H2S-PASSIVE-COLORIMETRIC',
  };

  // Header text with comfortable padding from strap edge
  ctx.fillStyle = '#f2f2f2';
  ctx.font = 'bold 13px sans-serif';
  ctx.fillText('H₂S DOSIMETER', bandX + 35, bandY + 34);
  ctx.font = '9px sans-serif';
  ctx.fillText('PASSIVE EXPOSURE MONITOR', bandX + 35, bandY + 47);

  // Sensing patch (this is what the pipeline should isolate and measure)
  const patchX = bandX + 35;
  const patchY = bandY + 62;
  const patchW = 210;
  const patchH = 175;
  ctx.fillStyle = `rgb(${patchColor.r | 0}, ${patchColor.g | 0}, ${patchColor.b | 0})`;
  roundRect(ctx, patchX, patchY, patchW, patchH, 6);
  ctx.fill();

  // A faint highlight streak (specular glare) to exercise highlight rejection
  ctx.save();
  ctx.globalAlpha = 0.18;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.ellipse(patchX + patchW * 0.25, patchY + patchH * 0.2, patchW * 0.15, patchH * 0.5, -0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Reference Color Patch: neutral gray standard (#808080 / RGB 128,128,128) matching TARGET_REFERENCE_RGB
  const refX = patchX + patchW + 18;
  const refY = patchY + 8;
  const refW = 44;
  const refH = patchH - 16;
  ctx.fillStyle = '#808080';
  roundRect(ctx, refX, refY, refW, refH, 4);
  ctx.fill();
  ctx.strokeStyle = '#3a3f45';
  ctx.lineWidth = 1.5;
  roundRect(ctx, refX, refY, refW, refH, 4);
  ctx.stroke();

  ctx.fillStyle = '#a6a49f';
  ctx.font = 'bold 8px sans-serif';
  ctx.fillText('REF', refX + 13, refY - 4);

  // QR code area (real, scannable)
  const qrPayload = JSON.stringify({
    workerId: badge.workerId,
    workerName: badge.workerName,
    department: badge.department,
    shift: badge.shift,
    site: badge.site,
    badgeId: badge.badgeId,
    batchId: badge.batchId,
    issueDate: badge.issueDate,
    expiryDate: badge.expiryDate,
  });
  const qrCanvas = document.createElement('canvas');
  await QRCode.toCanvas(qrCanvas, qrPayload, { scale: 3, margin: 4, errorCorrectionLevel: 'L' });
  const qrSize = qrCanvas.width;
  const qrX = refX + refW + 20;
  const qrY = bandY + (bandH - qrSize) / 2;
  ctx.fillStyle = '#f2f2f2';
  ctx.fillRect(qrX - 5, qrY - 5, qrSize + 10, qrSize + 10);
  ctx.drawImage(qrCanvas, qrX, qrY, qrSize, qrSize);

  // Footer text with comfortable padding from strap edge
  ctx.fillStyle = '#f2f2f2';
  ctx.font = 'bold 11px sans-serif';
  ctx.fillText(`${badge.workerId}  ${badge.workerName}`, bandX + 35, bandY + bandH - 30);
  ctx.font = '9px sans-serif';
  ctx.fillText(`${badge.department}  ${badge.shift}`, bandX + 35, bandY + bandH - 18);
  ctx.fillText(`${badge.badgeId}  ${badge.batchId}`, bandX + 35, bandY + bandH - 6);

  return {
    id: def.id,
    label: calState.label,
    calibrationId: def.calibrationId,
    badge,
    dataUrl: canvas.toDataURL('image/png'),
  };
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

let cachedDemoImages = null;

/** Lazily generate (and cache) the demo badge images. */
export async function getDemoImages() {
  if (cachedDemoImages) return cachedDemoImages;
  cachedDemoImages = await Promise.all(DEMO_DEFS.map(generateDemoImage));
  return cachedDemoImages;
}
