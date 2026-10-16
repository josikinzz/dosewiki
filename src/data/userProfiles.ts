import {
  buildFallbackContributorProfile,
  deriveProfileKeyFromEmail,
  findContributorProfileByAuthorName,
  findContributorProfileByKeyOrAlias,
  materializeContributorProfile,
  normalizeProfileAliases,
  normalizeProfileKey,
  sanitizeContributorAvatarUrl,
  sanitizeContributorBio,
  sanitizeContributorLinks,
  toContributorDisplayName,
} from "../../lib/contributorProfileIdentity";

type UserProfileLink = {
  label: string;
  url: string;
}



export type NormalizedUserProfile = {
  key: string;
  displayName: string;
  aliases: string[];
  avatarUrl: string | null;
  bio: string;
  links: UserProfileLink[];
  hasCustomBio: boolean;
  role?: string;
  reportOrder?: string[];
  exclude_from_gallery?: boolean;
  archival?: boolean;
  approved_replicator?: boolean;
  staffNote?: {
    markdown: string;
    attribution?: string;
  };
};

export { deriveProfileKeyFromEmail, normalizeProfileKey };

export function toDisplayName(key: string, fallback = "Contributor"): string {
  return toContributorDisplayName(key, fallback);
}

function sanitizeLinks(links: unknown): UserProfileLink[] {
  if (!Array.isArray(links) || links.length === 0) {
    return [];
  }

  return sanitizeContributorLinks(
    links
      .filter((entry): entry is { label?: unknown; url?: unknown } => Boolean(entry) && typeof entry === "object")
      .map((entry) => ({
        label: typeof entry.label === "string" ? entry.label : "",
        url: typeof entry.url === "string" ? entry.url : "",
      })),
  );
}

function sanitizeBio(bio: unknown): string {
  return typeof bio === "string" ? sanitizeContributorBio(bio, { trimEnd: true }) : "";
}

function sanitizeAvatarUrl(value: unknown): string | null {
  return typeof value === "string" ? sanitizeContributorAvatarUrl(value) : null;
}

function sanitizeAliases(aliases: unknown): string[] {
  if (!Array.isArray(aliases)) {
    return [];
  }

  return normalizeProfileAliases(aliases.filter((entry): entry is string => typeof entry === "string"));
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
  const rawRole = (record as { role?: unknown }).role;

  return materializeContributorProfile({
    key,
    displayName,
    aliases,
    avatarUrl,
    bio,
    links,
    role: typeof rawRole === "string" ? rawRole : null,
  });
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
  return buildFallbackContributorProfile(rawKey);
}

export function getProfileByKeyFromList(
  profiles: readonly NormalizedUserProfile[],
  key: string,
): NormalizedUserProfile {
  const normalizedKey = normalizeProfileKey(key);
  if (!normalizedKey) {
    return buildFallbackProfile("Contributor");
  }

  return findContributorProfileByKeyOrAlias(profiles, normalizedKey) ?? buildFallbackProfile(normalizedKey);
}

export function getProfileMapFromList(
  profiles: readonly NormalizedUserProfile[],
): Map<string, NormalizedUserProfile> {
  return new Map(profiles.map((profile) => [profile.key, profile]));
}

export function findProfileByAuthorNameInList(
  profiles: readonly NormalizedUserProfile[],
  authorName: string,
): NormalizedUserProfile | null {
  return findContributorProfileByAuthorName(profiles, authorName);
}
