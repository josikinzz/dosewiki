const DEFAULT_PASSWORD_KEYS = [
  "ADMIN_PASSWORD",
  "ZENBY",
  "KOSM",
  "COE",
  "JOSIE",
  "LYREA",
  "WITCHY",
  "ARCTIC",
  "GABRIEL",
] as const;

type LegacyCredentialEnv = Partial<Record<string, string | undefined>>;

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

const parseAdditionalKeys = (env: LegacyCredentialEnv = process.env) => {
  const raw = env.DEV_PASSWORD_KEYS;
  if (typeof raw !== "string" || raw.trim().length === 0) {
    return [];
  }

  return raw
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
};

export function getLegacyCredentialKeys(env: LegacyCredentialEnv = process.env): string[] {
  return [...DEFAULT_PASSWORD_KEYS, ...parseAdditionalKeys(env)];
}

export function hasLegacyCredentialsConfigured({
  env = process.env,
}: {
  env?: LegacyCredentialEnv;
} = {}): boolean {
  return getLegacyCredentialKeys(env).some((key) => {
    const value = env[key];
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
