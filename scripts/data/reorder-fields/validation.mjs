import crypto from 'crypto';

export function countPrimitives(obj) {
  if (obj === null || obj === undefined) {
    return 1;
  }
  if (typeof obj !== 'object') {
    return 1;
  }
  if (Array.isArray(obj)) {
    return obj.reduce((count, entry) => count + countPrimitives(entry), 0);
  }
  return Object.keys(obj).reduce((count, key) => count + countPrimitives(obj[key]), 0);
}

export function contentHash(obj) {
  const sortedJson = JSON.stringify(obj, (_key, value) => {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return Object.keys(value).sort().reduce((result, key) => {
        result[key] = value[key];
        return result;
      }, {});
    }
    return value;
  });
  return crypto.createHash('sha256').update(sortedJson).digest('hex').slice(0, 16);
}

export function validateReordering(before, after) {
  const beforeCount = countPrimitives(before);
  const afterCount = countPrimitives(after);
  const beforeHash = contentHash(before);
  const afterHash = contentHash(after);

  return {
    beforeCount,
    afterCount,
    beforeHash,
    afterHash,
    primitiveCountMatches: beforeCount === afterCount,
    contentHashMatches: beforeHash === afterHash,
  };
}
