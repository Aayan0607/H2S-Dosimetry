import { rgbToHex } from '../vision/colorSpace';

export function pct(v) {
  return `${Math.round(v * 100)}%`;
}

export function rgbCss({ r, g, b }) {
  return `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
}

export function rgbHex({ r, g, b }) {
  return rgbToHex(r, g, b).toUpperCase();
}

export function fmt(n, digits = 1) {
  return Number(n).toFixed(digits);
}

export function riskColorVar(risk) {
  const map = {
    SAFE: 'var(--safe)',
    'LOW RISK': 'var(--low)',
    'MODERATE RISK': 'var(--moderate)',
    'HIGH RISK': 'var(--high)',
    'CRITICAL RISK': 'var(--critical)',
  };
  return map[risk] || 'var(--text-dim)';
}

export function riskSoftColorVar(risk) {
  const map = {
    SAFE: 'var(--safe-soft)',
    'LOW RISK': 'var(--low-soft)',
    'MODERATE RISK': 'var(--moderate-soft)',
    'HIGH RISK': 'var(--high-soft)',
    'CRITICAL RISK': 'var(--critical-soft)',
  };
  return map[risk] || 'var(--panel-raised)';
}

export function qualityColorVar(label) {
  const map = {
    good: 'var(--safe)',
    fair: 'var(--moderate)',
    poor: 'var(--critical)',
  };
  return map[label] || 'var(--text-dim)';
}

export function timeAgo(iso) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}
