import { rgbToLab } from '../vision/colorSpace';

// Default calibration reference states for a passive colorimetric H2S badge
// using a colorimetric sensing medium, which darkens from pale cyan
// toward brown/black as lead sulfide forms with increasing exposure.
// These are prototype reference points — see the Calibration page to
// recalibrate against real photographed badges.
export const DEFAULT_CALIBRATION = [
  {
    id: 'unexposed',
    label: 'Unexposed',
    exposureCategory: 'UNEXPOSED',
    risk: 'SAFE',
    order: 0,
    color: { r: 212, g: 228, b: 227 },
    doseRangePpmH: [0, 0.75],
    description: 'Pale cyan baseline; estimated cumulative exposure near 0 ppm·h.',
  },
  {
    id: 'low',
    label: 'Low',
    exposureCategory: 'LOW',
    risk: 'LOW RISK',
    order: 1,
    color: { r: 200, g: 203, b: 185 },
    doseRangePpmH: [0.75, 5],
    description: 'Faint brown specking; estimated cumulative exposure below 5 ppm·h.',
  },
  {
    id: 'moderate',
    label: 'Moderate',
    exposureCategory: 'MODERATE',
    risk: 'MODERATE RISK',
    order: 2,
    color: { r: 203, g: 194, b: 168 },
    doseRangePpmH: [5, 15],
    description: 'Diffuse tan/brown mottling; estimated cumulative exposure of 5–15 ppm·h.',
  },
  {
    id: 'high',
    label: 'High',
    exposureCategory: 'HIGH',
    risk: 'HIGH RISK',
    order: 3,
    color: { r: 160, g: 120, b: 80 },
    doseRangePpmH: [15, 25],
    description: 'Strong brown transition; synthetic prototype range of 15–25 ppm·h.',
  },
  {
    id: 'critical',
    label: 'Critical',
    exposureCategory: 'CRITICAL',
    risk: 'CRITICAL RISK',
    order: 4,
    color: { r: 50, g: 35, b: 25 },
    doseRangePpmH: [25, null],
    description: 'Heavy brown/black darkening; synthetic prototype range above 25 ppm·h.',
  },
];

export function withLab(calibration) {
  return calibration.map((state) => ({
    ...state,
    lab: rgbToLab(state.color.r, state.color.g, state.color.b),
  }));
}

export const RISK_ORDER = ['SAFE', 'LOW RISK', 'MODERATE RISK', 'HIGH RISK', 'CRITICAL RISK'];
