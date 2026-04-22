import {
  initialChangeLogEntries,
  sortChangeLogEntries,
  type ChangeLogEntry,
} from "./changelog/changeLog";

export type UserProfileLink = {
  label: string;
  url: string;
};

export type UserProfileRecord = {
  key: string;
  displayName?: string;
  aliases?: string[];
  avatarStorageId?: string | null;
  avatarUrl?: string | null;
  bio?: string | null;
  links?: UserProfileLink[] | null;
  membershipEmail?: string | null;
  createdAt?: string;
  updatedAt?: string;
  updatedBy?: string | null;
};

export type NormalizedUserProfile = {
  key: string;
  displayName: string;
  aliases: string[];
  avatarUrl: string | null;
  bio: string;
  links: UserProfileLink[];
  hasCustomBio: boolean;
};

const HTTPS_PROTOCOL = "https:";
const AVATAR_PUBLIC_BASE_PATH = "/profile-avatars/";
const MAX_LINKS = 3;
const MAX_BIO_LENGTH = 4000;

export function normalizeProfileKey(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim().toUpperCase() : "";
}

export function deriveProfileKeyFromEmail(email: string | null | undefined): string {
  const normalizedEmail = typeof email === "string" ? email.trim() : "";
  if (!normalizedEmail) {
    return "";
  }

  const localPart = normalizedEmail.split("@")[0]?.trim() ?? "";
  const normalizedKey = localPart.replace(/[^a-z0-9-]/gi, "").toUpperCase();
  return normalizedKey || normalizedEmail.toUpperCase();
}

export function toDisplayName(key: string, fallback = "Contributor"): string {
  return (
    key
      .split(/[_\-\s]+/)
      .filter((segment) => segment.length > 0)
      .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1).toLowerCase())
      .join(" ") || fallback
  );
}

function isValidHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === HTTPS_PROTOCOL;
  } catch {
    return false;
  }
}

function sanitizeLinks(links: unknown): UserProfileLink[] {
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
}

function sanitizeBio(bio: unknown): string {
  if (typeof bio !== "string") {
    return "";
  }

  const trimmed = bio.trimEnd();
  if (trimmed.length > MAX_BIO_LENGTH) {
    return trimmed.slice(0, MAX_BIO_LENGTH);
  }

  return trimmed;
}

function sanitizeAvatarUrl(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  if (trimmed.startsWith(AVATAR_PUBLIC_BASE_PATH)) {
    const [pathPart] = trimmed.split("?");
    if (!pathPart || pathPart.includes("..")) {
      return null;
    }
    return trimmed;
  }

  if (isValidHttpsUrl(trimmed)) {
    return trimmed;
  }

  return null;
}

function sanitizeAliases(aliases: unknown): string[] {
  if (!Array.isArray(aliases)) {
    return [];
  }

  const normalized = aliases
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0);

  return Array.from(new Set(normalized));
}

export function normalizeProfileRecord(record: unknown): NormalizedUserProfile | null {
  if (!record || typeof record !== "object") {
    return null;
  }

  const rawKey = (record as { key?: unknown }).key;
  if (typeof rawKey !== "string") {
    return null;
  }

  const key = normalizeProfileKey(rawKey);
  if (!key) {
    return null;
  }

  const rawDisplayName = (record as { displayName?: unknown }).displayName;
  const displayName =
    typeof rawDisplayName === "string" && rawDisplayName.trim().length > 0
      ? rawDisplayName.trim()
      : toDisplayName(key);

  const avatarUrl = sanitizeAvatarUrl((record as { avatarUrl?: unknown }).avatarUrl);
  const bio = sanitizeBio((record as { bio?: unknown }).bio ?? null);
  const links = sanitizeLinks((record as { links?: unknown }).links ?? null);
  const aliases = sanitizeAliases((record as { aliases?: unknown }).aliases);

  return {
    key,
    displayName,
    aliases,
    avatarUrl,
    bio,
    links,
    hasCustomBio: bio.trim().length > 0,
  };
}

export function normalizeProfiles(records: unknown[]): NormalizedUserProfile[] {
  const profilesByKey = new Map<string, NormalizedUserProfile>();

  for (const record of records) {
    const profile = normalizeProfileRecord(record);
    if (!profile || profilesByKey.has(profile.key)) {
      continue;
    }

    profilesByKey.set(profile.key, profile);
  }

  return Array.from(profilesByKey.values()).sort((left, right) => left.key.localeCompare(right.key));
}

export function buildFallbackProfile(rawKey: string): NormalizedUserProfile {
  const key = normalizeProfileKey(rawKey) || "CONTRIBUTOR";
  const displayName = toDisplayName(key, "Contributor");

  return {
    key,
    displayName,
    aliases: [],
    avatarUrl: null,
    bio: "",
    links: [],
    hasCustomBio: false,
  };
}

export function getProfileByKeyFromList(
  profiles: readonly NormalizedUserProfile[],
  key: string,
): NormalizedUserProfile {
  const normalizedKey = normalizeProfileKey(key);
  if (!normalizedKey) {
    return buildFallbackProfile("Contributor");
  }

  const exactMatch = profiles.find((profile) => profile.key === normalizedKey);
  if (exactMatch) {
    return exactMatch;
  }

  const normalizedAlias = normalizedKey.toLowerCase();
  const aliasMatch = profiles.find((profile) => profile.aliases.includes(normalizedAlias));
  return aliasMatch ?? buildFallbackProfile(normalizedKey);
}

export function getProfileMapFromList(
  profiles: readonly NormalizedUserProfile[],
): Map<string, NormalizedUserProfile> {
  return new Map(profiles.map((profile) => [profile.key, profile]));
}

export function buildProfileHistory(key: string, limit = 10, aliases: string[] = []): ChangeLogEntry[] {
  const normalizedKey = normalizeProfileKey(key);
  if (!normalizedKey) {
    return [];
  }

  const acceptedKeys = new Set([
    normalizedKey,
    ...aliases.map((alias) => normalizeProfileKey(alias)).filter(Boolean),
  ]);

  const filtered = initialChangeLogEntries.filter(
    (entry) => acceptedKeys.has((entry.submittedBy ?? "").toUpperCase()),
  );

  if (filtered.length === 0) {
    return [];
  }

  return sortChangeLogEntries(filtered).slice(0, limit);
}

export function findProfileByAuthorNameInList(
  profiles: readonly NormalizedUserProfile[],
  authorName: string,
): NormalizedUserProfile | null {
  const normalized = authorName.trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  for (const profile of profiles) {
    if (profile.displayName.toLowerCase() === normalized) {
      return profile;
    }

    if (profile.aliases.includes(normalized)) {
      return profile;
    }

    const firstWord = profile.displayName.split(/\s+/)[0]?.toLowerCase();
    if (firstWord && firstWord === normalized) {
      return profile;
    }
  }

  return null;
}
