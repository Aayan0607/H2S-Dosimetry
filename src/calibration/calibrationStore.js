import { DEFAULT_CALIBRATION } from './calibrationData';
import { getBatchCalibration } from './batchCalibrationData';
import { saveAnalysis } from '../api/backendApi';

const CALIBRATION_KEY = 'h2s_dosimeter_calibration_v1';
const HISTORY_KEY = 'h2s_dosimeter_history_v1';

export function loadCalibration(batchId) {
  // If batchId is PRESENT (non-empty string):
  if (batchId != null && typeof batchId === 'string' && batchId.trim() !== '') {
    const batchCal = getBatchCalibration(batchId);
    if (batchCal) {
      return batchCal;
    }
    // Prototype/hackathon fallback: keep analysis available for unregistered
    // batches while making the fallback visible in the returned data.
    return DEFAULT_CALIBRATION.map((state) => ({
      ...state,
      batchId: batchId.trim(),
      calibrationSource: 'default_fallback',
    }));
  }

  // batchId is ABSENT: use existing localStorage calibration or DEFAULT_CALIBRATION
  // so legacy badges continue to work
  try {
    const raw = localStorage.getItem(CALIBRATION_KEY);
    if (!raw) return DEFAULT_CALIBRATION;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length !== DEFAULT_CALIBRATION.length) {
      return DEFAULT_CALIBRATION;
    }
    return parsed;
  } catch {
    return DEFAULT_CALIBRATION;
  }
}

export function saveCalibration(calibration) {
  localStorage.setItem(CALIBRATION_KEY, JSON.stringify(calibration));
}

export function resetCalibration() {
  localStorage.removeItem(CALIBRATION_KEY);
  return DEFAULT_CALIBRATION;
}

export function loadHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function pushHistoryEntry(entry) {
  const history = loadHistory();
  history.unshift(entry);
  const trimmed = history.slice(0, 50);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(trimmed));
  saveAnalysis(entry).catch((error) => {
    console.warn('[Backend] SQLite unavailable; analysis remains saved locally.', error);
  });
  return trimmed;
}

export function clearHistory() {
  localStorage.removeItem(HISTORY_KEY);
  return [];
}
