import { timingSafeEqual } from "node:crypto";

/**
 * Constant-time string comparison to prevent timing attacks.
 * @param {string} a - First string to compare
 * @param {string} b - Second string to compare
 * @returns {boolean} Whether the strings are equal
 */
const safeCompare = (a, b) => {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);

  const maxLength = Math.max(bufA.length, bufB.length);
  const paddedA = Buffer.alloc(maxLength);
  const paddedB = Buffer.alloc(maxLength);

  bufA.copy(paddedA);
  bufB.copy(paddedB);

  return bufA.length === bufB.length && timingSafeEqual(paddedA, paddedB);
};

const DEFAULT_PASSWORD_KEYS = [
  "ADMIN_PASSWORD",
  "ZENBY",
  "KOSM",
  "COE",
  "JOSIE",
  "WITCHY",
  "ARCTIC",
  "GABRIEL",
];

const parseAdditionalKeys = () => {
  const raw = process.env.DEV_PASSWORD_KEYS;
  if (typeof raw !== "string" || raw.trim().length === 0) {
    return [];
  }

  return raw
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
};

export const getValidUsernames = () => {
  return [...DEFAULT_PASSWORD_KEYS, ...parseAdditionalKeys()];
};

export const verifyCredentials = (username, password) => {
  if (typeof username !== "string" || typeof password !== "string") {
    return false;
  }

  const trimmedUsername = username.trim();
  const trimmedPassword = password.trim();

  if (trimmedUsername.length === 0 || trimmedPassword.length === 0) {
    return false;
  }

  const validUsernames = getValidUsernames();
  let matchedUsername = null;
  for (const candidate of validUsernames) {
    if (safeCompare(candidate, trimmedUsername)) {
      matchedUsername = candidate;
    }
  }

  if (!matchedUsername) {
    return false;
  }

  const expectedPassword = process.env[matchedUsername];

  if (typeof expectedPassword !== "string") {
    return false;
  }

  return safeCompare(expectedPassword.trim(), trimmedPassword);
};

export const loadPasswordEntries = () => {
  const seen = new Set();
  const entries = [];
  const keys = getValidUsernames();

  for (const key of keys) {
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);

    const value = process.env[key];
    if (typeof value !== "string") {
      continue;
    }

    const trimmed = value.trim();
    if (trimmed.length === 0) {
      continue;
    }

    entries.push({ key, value: trimmed });
  }

  return entries;
};

export const findPasswordKey = (password, entries = loadPasswordEntries()) => {
  if (typeof password !== "string") {
    return null;
  }

  const trimmed = password.trim();
  if (trimmed.length === 0) {
    return null;
  }

  for (const entry of entries) {
    if (safeCompare(entry.value, trimmed)) {
      return entry.key;
    }
  }

  return null;
};
