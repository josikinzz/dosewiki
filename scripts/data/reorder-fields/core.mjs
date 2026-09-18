export function orderObject(source, order, options = {}) {
  const { context = '', verbose = false, logger = console } = options;

  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    return source;
  }

  const ordered = {};
  const sourceKeys = Object.keys(source);
  const unexpectedKeys = [];

  for (const key of order) {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      ordered[key] = source[key];
    }
  }

  for (const key of sourceKeys) {
    if (!order.includes(key)) {
      unexpectedKeys.push(key);
      ordered[key] = source[key];
    }
  }

  if (verbose && unexpectedKeys.length > 0) {
    logger.log(`  [warn] Unexpected fields in ${context}: ${unexpectedKeys.join(', ')}`);
  }

  return ordered;
}

export function reorderOrderedRecord(record, preferredKeys, reorderValue) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    return record;
  }

  const result = {};
  for (const key of preferredKeys) {
    if (Object.prototype.hasOwnProperty.call(record, key)) {
      result[key] = reorderValue(record[key]);
    }
  }
  for (const key of Object.keys(record)) {
    if (!preferredKeys.includes(key)) {
      result[key] = reorderValue(record[key]);
    }
  }
  return result;
}
