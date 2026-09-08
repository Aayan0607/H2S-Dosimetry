/**
 * TEST / PROTOTYPE BATCH CALIBRATION PROFILES
 *
 * IMPORTANT NOTICE:
 * The calibration reference curves and color values defined in this file
 * are synthetic TEST / PROTOTYPE datasets designed specifically for software
 * validation, unit testing, and demonstration of batch-specific calibration
 * switching.
 *
 * THESE ARE TEST / PROTOTYPE VALUES, NOT EXPERIMENTALLY VALIDATED CHEMISTRY.
 * Real-world deployment requires empirical calibration curves obtained from
 * controlled laboratory exposure chambers for each chemical manufacturing lot.
 */

import { DEFAULT_CALIBRATION } from './calibrationData';

/**
 * Prototype calibration curve for BATCH-01.
 * Intentionally calibrated with slightly cooler/higher-density threshold points.
 */
export const BATCH_01_CALIBRATION = [
  {
    id: 'unexposed',
    label: 'Unexposed',
    exposureCategory: 'UNEXPOSED',
    risk: 'SAFE',
    order: 0,
    color: { r: 248, g: 242, b: 232 },
    description: 'Test/Prototype Batch 01: Fresh sensing medium (baseline).',
    batchId: 'BATCH-01',
  },
  {
    id: 'low',
    label: 'Low',
    exposureCategory: 'LOW',
    risk: 'LOW RISK',
    order: 1,
    color: { r: 218, g: 190, b: 145 },
    description: 'Test/Prototype Batch 01: Low exposure threshold.',
    batchId: 'BATCH-01',
  },
  {
    id: 'moderate',
    label: 'Moderate',
    exposureCategory: 'MODERATE',
    risk: 'MODERATE RISK',
    order: 2,
    color: { r: 172, g: 135, b: 88 },
    description: 'Test/Prototype Batch 01: Moderate exposure threshold.',
    batchId: 'BATCH-01',
  },
  {
    id: 'high',
    label: 'High',
    exposureCategory: 'HIGH',
    risk: 'HIGH RISK',
    order: 3,
    color: { r: 115, g: 78, b: 42 },
    description: 'Test/Prototype Batch 01: High exposure threshold.',
    batchId: 'BATCH-01',
  },
  {
    id: 'critical',
    label: 'Critical',
    exposureCategory: 'CRITICAL',
    risk: 'CRITICAL RISK',
    order: 4,
    color: { r: 46, g: 30, b: 18 },
    description: 'Test/Prototype Batch 01: Critical exposure threshold.',
    batchId: 'BATCH-01',
  },
];

/**
 * Prototype calibration curve for BATCH-02.
 * Intentionally calibrated with warmer baseline and shifted perceptual boundaries.
 */
export const BATCH_02_CALIBRATION = [
  {
    id: 'unexposed',
    label: 'Unexposed',
    exposureCategory: 'UNEXPOSED',
    risk: 'SAFE',
    order: 0,
    color: { r: 236, g: 226, b: 204 },
    description: 'Test/Prototype Batch 02: Warm baseline sensing medium.',
    batchId: 'BATCH-02',
  },
  {
    id: 'low',
    label: 'Low',
    exposureCategory: 'LOW',
    risk: 'LOW RISK',
    order: 1,
    color: { r: 204, g: 172, b: 122 },
    description: 'Test/Prototype Batch 02: Accelerated low exposure point.',
    batchId: 'BATCH-02',
  },
  {
    id: 'moderate',
    label: 'Moderate',
    exposureCategory: 'MODERATE',
    risk: 'MODERATE RISK',
    order: 2,
    color: { r: 158, g: 118, b: 68 },
    description: 'Test/Prototype Batch 02: Mid-range tan shift point.',
    batchId: 'BATCH-02',
  },
  {
    id: 'high',
    label: 'High',
    exposureCategory: 'HIGH',
    risk: 'HIGH RISK',
    order: 3,
    color: { r: 98, g: 64, b: 32 },
    description: 'Test/Prototype Batch 02: High density darkening.',
    batchId: 'BATCH-02',
  },
  {
    id: 'critical',
    label: 'Critical',
    exposureCategory: 'CRITICAL',
    risk: 'CRITICAL RISK',
    order: 4,
    color: { r: 38, g: 22, b: 14 },
    description: 'Test/Prototype Batch 02: Maximum saturation dark.',
    batchId: 'BATCH-02',
  },
];

/**
 * Registry of known batch calibration datasets.
 * Includes BATCH-01, BATCH-02, and registered demo badge batch numbers.
 */
export const BATCH_CALIBRATIONS = {
  // Current prototype uses one cyan-to-brown reference scale across batches.
  'BATCH-01': DEFAULT_CALIBRATION.map((s) => ({ ...s, batchId: 'BATCH-01' })),
  'BATCH-02': DEFAULT_CALIBRATION.map((s) => ({ ...s, batchId: 'BATCH-02' })),

  // Demo badges registered to baseline prototype calibration profiles
  'BATCH-0926-CU01': DEFAULT_CALIBRATION.map((s) => ({ ...s, batchId: 'BATCH-0926-CU01' })),
  'MRPL-D02': DEFAULT_CALIBRATION.map((s) => ({ ...s, batchId: 'MRPL-D02' })),
  'MRPL-D03': DEFAULT_CALIBRATION.map((s) => ({ ...s, batchId: 'MRPL-D03' })),
  'MRPL-D04': DEFAULT_CALIBRATION.map((s) => ({ ...s, batchId: 'MRPL-D04' })),
  'MRPL-D05': DEFAULT_CALIBRATION.map((s) => ({ ...s, batchId: 'MRPL-D05' })),
};

/**
 * Retrieve batch-specific calibration if batchId is known.
 * Supports exact and uppercase case-insensitive lookup.
 *
 * @param {string|null|undefined} batchId
 * @returns {Array|null} Array of calibration states if matching batch exists, else null.
 */
export function getBatchCalibration(batchId) {
  if (!batchId || typeof batchId !== 'string') return null;
  const trimmed = batchId.trim();
  if (BATCH_CALIBRATIONS[trimmed]) {
    return BATCH_CALIBRATIONS[trimmed];
  }
  const upper = trimmed.toUpperCase();
  if (BATCH_CALIBRATIONS[upper]) {
    return BATCH_CALIBRATIONS[upper];
  }
  return null;
}

/**
 * Check whether a matching batch calibration exists.
 *
 * @param {string|null|undefined} batchId
 * @returns {boolean}
 */
export function hasBatchCalibration(batchId) {
  return getBatchCalibration(batchId) !== null;
}
