/**
 * Badge Expiry / Reliability Verification
 *
 * Verifies whether a dosimeter badge is still within its operational lifetime
 * using the `expiryDate` attribute decoded from the badge QR code.
 */

/**
 * Verify badge validity and expiration from decoded QR metadata.
 *
 * Checks the `expiryDate` field (e.g. 'YYYY-MM-DD' or ISO timestamp).
 * Determines whether the badge is:
 *   - VALID: expiry date is current or in the future relative to referenceDate
 *   - EXPIRED: expiry date has passed relative to referenceDate
 *   - MISSING_EXPIRY: expiryDate field is absent
 *   - INVALID_EXPIRY: expiryDate string cannot be parsed as a valid date
 *
 * @param {object|null} metadata - Decoded QR metadata object
 * @param {Date} [referenceDate=new Date()] - Reference date for comparison
 * @returns {{
 *   status: 'VALID' | 'EXPIRED' | 'MISSING_EXPIRY' | 'INVALID_EXPIRY',
 *   valid: boolean,
 *   expiryDate: string | null,
 *   parsedExpiry: Date | null,
 *   referenceDate: string,
 *   message: string,
 * }}
 */
export function verifyBadgeExpiry(metadata, referenceDate = new Date()) {
  if (!metadata || !metadata.expiryDate) {
    return {
      status: 'MISSING_EXPIRY',
      valid: false,
      expiryDate: null,
      parsedExpiry: null,
      referenceDate: referenceDate.toISOString(),
      message: 'Badge expiry date is missing from QR metadata — exposure analysis blocked.',
    };
  }

  const expiryDateStr = String(metadata.expiryDate).trim();
  const parsed = new Date(expiryDateStr);

  if (isNaN(parsed.getTime())) {
    return {
      status: 'INVALID_EXPIRY',
      valid: false,
      expiryDate: expiryDateStr,
      parsedExpiry: null,
      referenceDate: referenceDate.toISOString(),
      message: 'Badge contains an invalid expiry date format — exposure analysis blocked.',
    };
  }

  // If a simple date without time is given (e.g. 'YYYY-MM-DD'), consider it valid
  // through the entire day until 23:59:59.999.
  let expiryTimestamp = parsed.getTime();
  if (/^\d{4}-\d{2}-\d{2}$/.test(expiryDateStr)) {
    const endOfDay = new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate(), 23, 59, 59, 999);
    expiryTimestamp = endOfDay.getTime();
  }

  const nowTimestamp = referenceDate.getTime();

  if (expiryTimestamp < nowTimestamp) {
    return {
      status: 'EXPIRED',
      valid: false,
      expiryDate: expiryDateStr,
      parsedExpiry: new Date(expiryTimestamp),
      referenceDate: referenceDate.toISOString(),
      message: 'Badge expired — exposure analysis blocked.',
    };
  }

  return {
    status: 'VALID',
    valid: true,
    expiryDate: expiryDateStr,
    parsedExpiry: new Date(expiryTimestamp),
    referenceDate: referenceDate.toISOString(),
    message: 'Badge is within validity period.',
  };
}
