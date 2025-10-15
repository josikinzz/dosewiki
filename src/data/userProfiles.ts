import userProfilesSource from "./userProfiles.json";
import {
  initialChangeLogEntries,
  sortChangeLogEntries,
  type ChangeLogEntry,
} from "./changeLog";

/**
 * Shapes persisted in src/data/userProfiles.json.
 *  - key: ENV credential identifier (uppercase string)
 *  - displayName: Optional friendlier label shown publicly (defaults to derived key)
 *  - avatarUrl: Optional HTTPS image URL for the contributor
 *  - bio: Optional Markdown string (<= 4k characters recommended)
 *  - links: Optional external resources (<=3 entries)
 */
export type UserProfileLink = {
  label: string;
  url: string;
};

export type UserProfileRecord = {
  key: string;
  displayName?: string;
  avatarUrl?: string | null;
  bio?: string | null;
  links?: UserProfileLink[] | null;
};

export type NormalizedUserProfile = {
  key: string;
  displayName: string;
  avatarUrl: string | null;
  bio: string;
  links: UserProfileLink[];
  hasCustomBio: boolean;
};

const HTTPS_PROTOCOL = "https:";
const MAX_LINKS = 3;
const MAX_BIO_LENGTH = 4000;

const toDisplayName = (key: string, fallback = "Contributor") => {
  return key
    .split(/[_\-\s]+/)
    .filter((segment) => segment.length > 0)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1).toLowerCase())
    .join(" ") || fallback;
};

const isValidHttpsUrl = (value: string) => {
  try {
    const url = new URL(value);
    return url.protocol === HTTPS_PROTOCOL;
  } catch {
    return false;
  }
};

const sanitizeLinks = (links: unknown): UserProfileLink[] => {
  if (!Array.isArray(links) || links.length === 0) {
    return [];
  }

  const normalized: UserProfileLink[] = [];

  for (const link of links) {
    if (normalized.length >= MAX_LINKS) {
      break;
    }

    if (!link || typeof link !== "object") {
      continue;
    }

    const rawLabel = (link as { label?: unknown }).label;
    const rawUrl = (link as { url?: unknown }).url;
    const label = typeof rawLabel === "string" ? rawLabel.trim() : "";
    const url = typeof rawUrl === "string" ? rawUrl.trim() : "";

    if (!label || !url || !isValidHttpsUrl(url)) {
      continue;
    }

    normalized.push({ label, url });
  }

  return normalized;
};

const sanitizeBio = (bio: unknown) => {
  if (typeof bio !== "string") {
    return "";
  }

  const trimmed = bio.trimEnd();
  if (trimmed.length > MAX_BIO_LENGTH) {
    return trimmed.slice(0, MAX_BIO_LENGTH);
  }

  return trimmed;
};

const sanitizeAvatarUrl = (value: unknown) => {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed || !isValidHttpsUrl(trimmed)) {
    return null;
  }

  return trimmed;
};

const normalizeProfileRecord = (record: unknown): NormalizedUserProfile | null => {
  if (!record || typeof record !== "object") {
    return null;
  }

  const rawKey = (record as { key?: unknown }).key;
  if (typeof rawKey !== "string") {
    return null;
  }

  const key = rawKey.trim().toUpperCase();
  if (key.length === 0) {
    return null;
  }

  const rawDisplayName = (record as { displayName?: unknown }).displayName;
  const displayName = typeof rawDisplayName === "string" && rawDisplayName.trim().length > 0
    ? rawDisplayName.trim()
    : toDisplayName(key);

  const avatarUrl = sanitizeAvatarUrl((record as { avatarUrl?: unknown }).avatarUrl);
  const bio = sanitizeBio((record as { bio?: unknown }).bio ?? null);
  const links = sanitizeLinks((record as { links?: unknown }).links ?? null);

  return {
    key,
    displayName,
    avatarUrl,
    bio,
    links,
    hasCustomBio: bio.trim().length > 0,
  } satisfies NormalizedUserProfile;
};

const profilesMap = new Map<string, NormalizedUserProfile>();

const normalizedProfiles: NormalizedUserProfile[] = [];

for (const record of userProfilesSource as unknown[]) {
  const profile = normalizeProfileRecord(record);
  if (!profile) {
    continue;
  }

  if (!profilesMap.has(profile.key)) {
    normalizedProfiles.push(profile);
  }

  profilesMap.set(profile.key, profile);
}

export const userProfiles = normalizedProfiles;
export const profilesByKey = profilesMap;

const buildFallbackProfile = (rawKey: string): NormalizedUserProfile => {
  const key = rawKey.trim().toUpperCase();
  const displayName = toDisplayName(key, "Contributor");

  return {
    key,
    displayName,
    avatarUrl: null,
    bio: "",
    links: [],
    hasCustomBio: false,
  };
};

export const getProfileByKey = (key: string): NormalizedUserProfile => {
  const normalizedKey = key.trim().toUpperCase();
  if (!normalizedKey) {
    return buildFallbackProfile("Contributor");
  }

  return profilesByKey.get(normalizedKey) ?? buildFallbackProfile(normalizedKey);
};

export const buildProfileHistory = (key: string, limit = 10): ChangeLogEntry[] => {
  const normalizedKey = key.trim().toUpperCase();
  if (!normalizedKey) {
    return [];
  }

  const filtered = initialChangeLogEntries.filter((entry) => {
    return (entry.submittedBy ?? "").toUpperCase() === normalizedKey;
  });

  if (filtered.length === 0) {
    return [];
  }

  return sortChangeLogEntries(filtered).slice(0, limit);
};

export const listProfileKeys = () => [...profilesByKey.keys()];

export const updateProfileCache = (profile: NormalizedUserProfile) => {
  profilesByKey.set(profile.key, profile);

  const existingIndex = userProfiles.findIndex((entry) => entry.key === profile.key);
  if (existingIndex >= 0) {
    userProfiles[existingIndex] = profile;
  } else {
    userProfiles.push(profile);
    userProfiles.sort((a, b) => a.key.localeCompare(b.key));
  }
};
