const DEFAULT_PASSWORD_KEYS = [
  "ADMIN_PASSWORD",
  "ZENBY",
  "KOSM",
  "COE",
  "JOSIE",
  "WITCHY",
  "ARCTIC",
  "GABRIEL",
] as const;

const safeCompare = (left: string, right: string) => {
  const maxLength = Math.max(left.length, right.length);
  const paddedLeft = left.padEnd(maxLength, "\0");
  const paddedRight = right.padEnd(maxLength, "\0");

  let result = left.length ^ right.length;
  for (let index = 0; index < maxLength; index += 1) {
    result |= paddedLeft.charCodeAt(index) ^ paddedRight.charCodeAt(index);
  }

  return result === 0;
};

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

export function getLegacyCredentialKeys(): string[] {
  return [...DEFAULT_PASSWORD_KEYS, ...parseAdditionalKeys()];
}

export function hasLegacyCredentialsConfigured(): boolean {
  return getLegacyCredentialKeys().some((key) => {
    const value = process.env[key];
    return typeof value === "string" && value.trim().length > 0;
  });
}

export function verifyLegacyCredentials(username: string, password: string): string | null {
  const trimmedUsername = username.trim();
  const trimmedPassword = password.trim();

  if (!trimmedUsername || !trimmedPassword) {
    return null;
  }

  let matchedKey: string | null = null;

  for (const candidate of getLegacyCredentialKeys()) {
    if (safeCompare(candidate, trimmedUsername)) {
      matchedKey = candidate;
    }
  }

  if (!matchedKey) {
    return null;
  }

  const expectedPassword = process.env[matchedKey];
  if (typeof expectedPassword !== "string") {
    return null;
  }

  return safeCompare(expectedPassword.trim(), trimmedPassword) ? matchedKey : null;
}
