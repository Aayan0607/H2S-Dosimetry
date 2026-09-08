const API_URL = (
  import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://127.0.0.1:8000' : '')
).replace(/\/$/, '');

function toFrontendEntry(row) {
  return {
    ...row,
    badgeId: row.badge_id,
    workerId: row.worker_id,
    workerName: row.worker_name,
    batchId: row.batch_id,
    issueDate: row.issue_date,
    expiryDate: row.expiry_date,
    estimatedDosePpmH: row.estimated_dose_ppm_h,
    estimatedExposurePpm8h: row.estimated_exposure_ppm_8h,
    doseIntervalPpmH: row.dose_interval_ppm_h,
    exposureIntervalPpm8h: row.exposure_interval_ppm_8h,
    deltaE: row.delta_e,
    imageQuality: row.image_quality,
    qrStatus: row.qr_status,
  };
}

async function request(path, options = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });
  if (!response.ok) throw new Error(`Backend request failed (${response.status})`);
  return response.status === 204 ? null : response.json();
}

export async function saveAnalysis(entry) {
  return request('/api/v1/analyses', { method: 'POST', body: JSON.stringify(entry) });
}

export async function fetchAnalyses() {
  const rows = await request('/api/v1/analyses');
  return rows.map(toFrontendEntry);
}

export async function clearBackendAnalyses() {
  return request('/api/v1/analyses', { method: 'DELETE' });
}
