export type ContributorProfileLink = {
  label: string;
  url: string;
};

export type ContributorProfileRecord = {
  key: string;
  displayName?: string | null;
  aliases?: string[] | null;
  avatarUrl?: string | null;
  bio?: string | null;
  links?: ContributorProfileLink[] | null;
  role?: string | null;
};

export type MaterializedContributorProfile = {
  key: string;
  displayName: string;
  aliases: string[];
  avatarUrl: string | null;
  bio: string;
  links: ContributorProfileLink[];
  hasCustomBio: boolean;
  // Free-text contributor title carried over from Effect Index ("Founder",
  // "Former Dev", "Replication Artist"). Deliberately unrelated to the
  // authorization role union in server/lib/contributorProfiles. Absent rather
  // than empty when unset, so consumers can render nothing at all.
  role?: string;
};

const HTTPS_PROTOCOL = "https:";
const AVATAR_PUBLIC_BASE_PATH = "/profile-avatars/";
const MAX_BIO_LENGTH = 4000;
const MAX_DISPLAY_NAME_LENGTH = 120;
const MAX_ROLE_LENGTH = 80;
export const MAX_CONTRIBUTOR_PROFILE_LINKS = 6;
const MAX_LINK_LABEL_LENGTH = 60;

export function normalizeProfileKey(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim().toUpperCase() : "";
}

export function normalizeContributorEmail(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
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

export function resolveOwnedProfileKey(requestedKey: string | null | undefined, actorEmail: string): string {
  return normalizeProfileKey(requestedKey) || deriveProfileKeyFromEmail(actorEmail);
}

export function normalizeProfileAlias(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function normalizeProfileAliases(value: readonly string[] | null | undefined): string[] {
  return Array.from(
    new Set((value ?? []).map((entry) => normalizeProfileAlias(entry)).filter(Boolean)),
  );
}

const EMPTY_HANDLE_GROUPS: readonly (readonly string[])[] = [];
let cachedGroupsSource = "";
let cachedGroups: readonly (readonly string[])[] = EMPTY_HANDLE_GROUPS;

/**
 * Retired login handles that belong to the same person as a live profile key.
 *
 * These used to live as ordinary profile aliases, but unauthenticated profile
 * reads (`contributorProfiles:getAll`) ship stored aliases verbatim, and a
 * retired handle must never leave the deployment. The alias was scrubbed from
 * the stored row and the identity fact moved to the deployment environment:
 * `LEGACY_CONTRIBUTOR_HANDLE_GROUPS` lists groups separated by `;`, handles
 * within a group separated by `,` (e.g. `CURRENT,RETIRED`), any casing. Empty
 * when unset, so browser bundles and unconfigured deployments simply match
 * nothing extra. Both the Postgres reviewer-email derivation and the changelog
 * submitter matching expand through these groups without ever emitting them.
 */
export function legacyContributorHandleGroups(): readonly (readonly string[])[] {
  const raw = typeof process === "undefined" ? undefined : process.env.LEGACY_CONTRIBUTOR_HANDLE_GROUPS;
  if (!raw) return EMPTY_HANDLE_GROUPS;
  if (raw !== cachedGroupsSource) {
    cachedGroupsSource = raw;
    cachedGroups = raw
      .split(";")
      .map((group) => group.split(",").map(normalizeProfileKey).filter(Boolean))
      .filter((group) => group.length > 1);
  }
  return cachedGroups;
}

/**
 * Normalize the given handles (profile key, aliases, legacy stamps, any
 * casing) and pull in every legacy-group sibling. Returns uppercase keys,
 * ready for stamp comparison or lowercasing into legacy credential emails.
 */
export function expandLegacyContributorHandles(handles: Iterable<string>): Set<string> {
  const expanded = new Set<string>();
  for (const handle of handles) {
    const normalized = normalizeProfileKey(handle);
    if (normalized) {
      expanded.add(normalized);
    }
  }
  for (const group of legacyContributorHandleGroups()) {
    if (group.some((member) => expanded.has(member))) {
      for (const member of group) {
        expanded.add(member);
      }
    }
  }
  return expanded;
}

export function toContributorDisplayName(key: string, fallback = "Contributor"): string {
  return (
    key
      .split(/[_\-\s]+/)
      .filter((segment) => segment.length > 0)
      .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1).toLowerCase())
      .join(" ") || fallback
  );
}

export function sanitizeContributorDisplayName(value: string | null | undefined): string {
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (!trimmed) {
    return "";
  }

  return trimmed.length > MAX_DISPLAY_NAME_LENGTH ? trimmed.slice(0, MAX_DISPLAY_NAME_LENGTH) : trimmed;
}

/**
 * Normalize a contributor title. Collapses internal whitespace so a role never
 * introduces line breaks into the header line that renders it, and returns ""
 * for anything blank so callers can drop the field instead of storing an empty
 * string that would render an empty separator.
 */
export function sanitizeContributorRole(value: string | null | undefined): string {
  const trimmed = typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
  if (!trimmed) {
    return "";
  }

  return trimmed.length > MAX_ROLE_LENGTH ? trimmed.slice(0, MAX_ROLE_LENGTH).trimEnd() : trimmed;
}

export function sanitizeContributorBio(value: string | null | undefined, options: { trimEnd?: boolean } = {}): string {
  const normalized = typeof value === "string" ? value.replace(/\r\n/g, "\n") : "";
  const bio = options.trimEnd ? normalized.trimEnd() : normalized;
  return bio.length > MAX_BIO_LENGTH ? bio.slice(0, MAX_BIO_LENGTH) : bio;
}

export function sanitizeContributorAvatarUrl(value: string | null | undefined): string | null {
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

  try {
    const url = new URL(trimmed);
    return url.protocol === HTTPS_PROTOCOL ? url.toString() : null;
  } catch {
    return null;
  }
}

export function sanitizeContributorLinks(links: readonly ContributorProfileLink[] | null | undefined): ContributorProfileLink[] {
  const normalized: ContributorProfileLink[] = [];

  for (const link of links ?? []) {
    if (normalized.length >= MAX_CONTRIBUTOR_PROFILE_LINKS) {
      break;
    }

    const label = typeof link.label === "string" ? link.label.trim() : "";
    const url = typeof link.url === "string" ? link.url.trim() : "";

    if (!label || !url) {
      continue;
    }

    try {
      const parsed = new URL(url);
      if (parsed.protocol !== HTTPS_PROTOCOL) {
        continue;
      }

      normalized.push({
        label: label.length > MAX_LINK_LABEL_LENGTH ? label.slice(0, MAX_LINK_LABEL_LENGTH) : label,
        url: parsed.toString(),
      });
    } catch {
      continue;
    }
  }

  return normalized;
}

export function materializeContributorProfile(record: ContributorProfileRecord): MaterializedContributorProfile | null {
  const key = normalizeProfileKey(record.key);
  if (!key) {
    return null;
  }

  const displayName = sanitizeContributorDisplayName(record.displayName) || toContributorDisplayName(key);
  const bio = sanitizeContributorBio(record.bio, { trimEnd: true });
  const role = sanitizeContributorRole(record.role);

  return {
    key,
    displayName,
    aliases: normalizeProfileAliases(record.aliases ?? []),
    avatarUrl: sanitizeContributorAvatarUrl(record.avatarUrl),
    bio,
    links: sanitizeContributorLinks(record.links ?? []),
    hasCustomBio: bio.trim().length > 0,
    ...(role ? { role } : {}),
  };
}

export function buildFallbackContributorProfile(rawKey: string): MaterializedContributorProfile {
  const key = normalizeProfileKey(rawKey) || "CONTRIBUTOR";

  return {
    key,
    displayName: toContributorDisplayName(key, "Contributor"),
    aliases: [],
    avatarUrl: null,
    bio: "",
    links: [],
    hasCustomBio: false,
  };
}

export function findContributorProfileByKeyOrAlias<T extends { key: string; aliases: readonly string[] }>(
  profiles: readonly T[],
  keyOrAlias: string,
): T | null {
  const normalizedKey = normalizeProfileKey(keyOrAlias);
  if (!normalizedKey) {
    return null;
  }

  const exactMatch = profiles.find((profile) => normalizeProfileKey(profile.key) === normalizedKey);
  if (exactMatch) {
    return exactMatch;
  }

  const normalizedAlias = normalizedKey.toLowerCase();
  return profiles.find((profile) => profile.aliases.includes(normalizedAlias)) ?? null;
}

/** The minimum a record needs to be matched against a free-text credit line. */
export type ContributorMatchableProfile = {
  displayName: string;
  aliases: readonly string[];
};

/**
 * Every name that identifies one contributor: their display name plus their
 * aliases, normalized for comparison.
 *
 * This is the only definition of "this name is that contributor" in the app, and
 * every direction of the relation — credit line to profile, profile to its
 * credits — goes through it, so the two can never disagree about the same pair.
 *
 * Matching is exact on a normalized whole name. It used to also accept the first
 * word of a display name, which quietly made "Josie" a match for "Josie Kins"
 * and would just as quietly make one contributor's given name claim another's
 * credits as the roster grows. Aliases are the mechanism for that: a spelling
 * that should resolve to a contributor is recorded on their profile.
 */
export function contributorMatchNames(profile: ContributorMatchableProfile): string[] {
  return Array.from(
    new Set(
      [profile.displayName, ...profile.aliases]
        .map((name) => normalizeProfileAlias(name))
        .filter(Boolean),
    ),
  );
}

export function profileMatchesName(profile: ContributorMatchableProfile, name: string): boolean {
  const normalized = normalizeProfileAlias(name);
  return normalized.length > 0 && contributorMatchNames(profile).includes(normalized);
}

export function findContributorProfileByAuthorName<T extends ContributorMatchableProfile>(
  profiles: readonly T[],
  authorName: string,
): T | null {
  const normalized = normalizeProfileAlias(authorName);
  if (!normalized) {
    return null;
  }

  return profiles.find((profile) => profileMatchesName(profile, normalized)) ?? null;
}
