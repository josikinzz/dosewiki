/**
 * Input validation utilities for batch scripts.
 *
 * SECURITY: This implements VULN-05 remediation from the security audit.
 * All batch scripts should use these utilities for parsing CLI arguments
 * to prevent resource exhaustion and other input-based attacks.
 */

/**
 * Safe bounds for input parameters.
 */
export const INPUT_BOUNDS = {
  concurrency: { min: 1, max: 50, default: 3 },
  limit: { min: 1, max: 10000, default: null },
  batchSize: { min: 1, max: 100, default: 20 },
  retryAttempts: { min: 1, max: 10, default: 3 },
  timeout: { min: 1000, max: 600000, default: 120000 }, // 1s to 10min
};

/**
 * Clamp a value to the specified bounds.
 *
 * @param {number} value - The value to clamp
 * @param {number} min - Minimum allowed value
 * @param {number} max - Maximum allowed value
 * @param {number|null} defaultValue - Default if value is NaN/invalid
 * @returns {number|null}
 */
export function clamp(value, min, max, defaultValue = null) {
  if (value === null || value === undefined || isNaN(value)) {
    return defaultValue;
  }
  return Math.min(Math.max(value, min), max);
}

/**
 * Parse and validate a concurrency value.
 *
 * @param {string} value - String value from CLI argument
 * @returns {number} Clamped concurrency value
 */
export function parseConcurrency(value) {
  const parsed = parseInt(value, 10);
  return clamp(
    parsed,
    INPUT_BOUNDS.concurrency.min,
    INPUT_BOUNDS.concurrency.max,
    INPUT_BOUNDS.concurrency.default
  );
}

/**
 * Parse and validate a limit value.
 *
 * @param {string} value - String value from CLI argument
 * @returns {number|null} Clamped limit value or null
 */
export function parseLimit(value) {
  const parsed = parseInt(value, 10);
  return clamp(
    parsed,
    INPUT_BOUNDS.limit.min,
    INPUT_BOUNDS.limit.max,
    INPUT_BOUNDS.limit.default
  );
}

/**
 * Parse and validate a batch size value.
 *
 * @param {string} value - String value from CLI argument
 * @returns {number} Clamped batch size value
 */
export function parseBatchSize(value) {
  const parsed = parseInt(value, 10);
  return clamp(
    parsed,
    INPUT_BOUNDS.batchSize.min,
    INPUT_BOUNDS.batchSize.max,
    INPUT_BOUNDS.batchSize.default
  );
}

/**
 * Parse and validate a timeout value (in milliseconds).
 *
 * @param {string} value - String value from CLI argument
 * @returns {number} Clamped timeout value
 */
export function parseTimeout(value) {
  const parsed = parseInt(value, 10);
  return clamp(
    parsed,
    INPUT_BOUNDS.timeout.min,
    INPUT_BOUNDS.timeout.max,
    INPUT_BOUNDS.timeout.default
  );
}

/**
 * Validate a slug value (alphanumeric + hyphens only).
 *
 * @param {string} slug - Slug to validate
 * @returns {boolean} True if valid
 */
export function isValidSlug(slug) {
  return /^[a-z0-9-]+$/.test(slug);
}

/**
 * Sanitize a slug value.
 *
 * @param {string} slug - Slug to sanitize
 * @returns {string} Sanitized slug
 */
export function sanitizeSlug(slug) {
  return slug
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Parse a comma-separated list of slugs with validation.
 *
 * @param {string} value - Comma-separated slugs
 * @returns {string[]} Array of sanitized slugs
 */
export function parseSlugs(value) {
  if (!value) return [];
  return value
    .split(',')
    .map(s => sanitizeSlug(s.trim()))
    .filter(s => s.length > 0);
}
