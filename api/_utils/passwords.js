const DEFAULT_PASSWORD_KEYS = ["ADMIN_PASSWORD", "ZENBY", "KOSM", "COE", "JOSIE", "WITCHY", "ARCTIC"];

const getEnv = () => {
  if (typeof process === "undefined" || typeof process.env !== "object") {
    return {};
  }
  return process.env;
};

const parseAdditionalKeys = () => {
  const env = getEnv();
  const raw = env.DEV_PASSWORD_KEYS;
  if (typeof raw !== "string" || raw.trim().length === 0) {
    return [];
  }

  return raw
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
};

export const loadPasswordEntries = () => {
  const seen = new Set();
  const entries = [];
  const keys = [...DEFAULT_PASSWORD_KEYS, ...parseAdditionalKeys()];
  const env = getEnv();

  for (const key of keys) {
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);

    const value = env[key];
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
    if (entry.value === trimmed) {
      return entry.key;
    }
  }

  const env = getEnv();
  for (const [envKey, envValue] of Object.entries(env)) {
      if (typeof envValue !== "string") {
        continue;
      }

      if (envValue.trim() === trimmed) {
        return envKey;
      }
    }

  return null;
};
