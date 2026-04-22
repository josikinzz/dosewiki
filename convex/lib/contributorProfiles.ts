import { v } from "convex/values";

export const roleValidator = v.union(v.literal("admin"), v.literal("editor"), v.literal("viewer"));

export const linkValidator = v.object({
  label: v.string(),
  url: v.string(),
});

export const profileInputValidator = v.object({
  key: v.string(),
  displayName: v.string(),
  bio: v.string(),
  links: v.array(linkValidator),
  avatarUrl: v.optional(v.union(v.string(), v.null())),
  avatarStorageId: v.optional(v.string()),
});

export const bulkImportProfileValidator = v.object({
  key: v.string(),
  displayName: v.string(),
  aliases: v.optional(v.array(v.string())),
  avatarStorageId: v.optional(v.string()),
  avatarUrl: v.optional(v.string()),
  bio: v.string(),
  links: v.array(linkValidator),
  membershipEmail: v.optional(v.string()),
  createdAt: v.optional(v.string()),
  updatedAt: v.optional(v.string()),
  updatedBy: v.optional(v.string()),
});

const MAX_BIO_LENGTH = 4000;
const MAX_DISPLAY_NAME_LENGTH = 120;
const MAX_LINKS = 3;
const MAX_LINK_LABEL_LENGTH = 60;
const HTTPS_PROTOCOL = "https:";
const AVATAR_PUBLIC_BASE_PATH = "/profile-avatars/";

export type ContributorRole = "admin" | "editor" | "viewer" | undefined;

export type ProfileLink = {
  label: string;
  url: string;
};

export type StoredProfile = {
  key: string;
  displayName: string;
  aliases: string[];
  avatarStorageId?: string;
  avatarUrl?: string;
  bio: string;
  links: ProfileLink[];
  membershipEmail?: string;
  createdAt: string;
  updatedAt: string;
  updatedBy?: string;
};

export type PublicProfile = {
  key: string;
  displayName: string;
  aliases: string[];
  avatarUrl: string | null;
  bio: string;
  links: ProfileLink[];
  hasCustomBio: boolean;
};

type StoredProfileDraftInput = {
  key: string;
  displayName: string;
  bio: string;
  links: ProfileLink[];
  avatarUrl?: string | null;
  avatarStorageId?: string;
};

type BulkImportProfileInput = {
  key: string;
  displayName: string;
  aliases?: string[];
  avatarStorageId?: string;
  avatarUrl?: string;
  bio: string;
  links: ProfileLink[];
  membershipEmail?: string;
  createdAt?: string;
  updatedAt?: string;
  updatedBy?: string;
};

type StorageCtx = {
  storage: {
    getUrl: (storageId: string) => Promise<string | null>;
  };
};

type SaveProfileAuthorizationInput = {
  actorEmail: string;
  actorRole: ContributorRole;
  targetKey: string;
  existingProfile: StoredProfile | null;
};

type RenameProfileInput = {
  existingAliases?: string[];
  fromKey: string;
  toKey: string;
  aliasesToAdd?: string[];
};

export function normalizeProfileKey(value: string): string {
  return value.trim().toUpperCase();
}

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function deriveProfileKeyFromEmail(email: string): string {
  const localPart = email.split("@")[0]?.trim() ?? "";
  const normalizedKey = localPart.replace(/[^a-z0-9-]/gi, "").toUpperCase();
  return normalizedKey || email.toUpperCase();
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

export function sanitizeDisplayName(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  return trimmed.length > MAX_DISPLAY_NAME_LENGTH
    ? trimmed.slice(0, MAX_DISPLAY_NAME_LENGTH)
    : trimmed;
}

export function sanitizeBio(value: string): string {
  const normalized = value.replace(/\r\n/g, "\n");
  return normalized.length > MAX_BIO_LENGTH ? normalized.slice(0, MAX_BIO_LENGTH) : normalized;
}

export function sanitizeAvatarUrl(value: string | null | undefined): string | null {
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

export function sanitizeAliases(value: string[] | undefined): string[] {
  return Array.from(
    new Set(
      (value ?? [])
        .map((entry) => entry.trim().toLowerCase())
        .filter((entry) => entry.length > 0),
    ),
  );
}

export function sanitizeLinks(links: ProfileLink[]): ProfileLink[] {
  const normalized: ProfileLink[] = [];

  for (const link of links) {
    if (normalized.length >= MAX_LINKS) {
      break;
    }

    const label = typeof link.label === "string" ? link.label.trim() : "";
    const url = typeof link.url === "string" ? link.url.trim() : "";

    if (!label || !url) {
      continue;
    }

    const normalizedLabel =
      label.length > MAX_LINK_LABEL_LENGTH ? label.slice(0, MAX_LINK_LABEL_LENGTH) : label;

    try {
      const parsed = new URL(url);
      if (parsed.protocol !== HTTPS_PROTOCOL) {
        continue;
      }

      normalized.push({
        label: normalizedLabel,
        url: parsed.toString(),
      });
    } catch {
      continue;
    }
  }

  return normalized;
}

export function isEditorRole(role: ContributorRole): boolean {
  return role === "admin" || role === "editor";
}

export function canClaimContributorProfile(args: {
  actorEmail: string;
  targetKey: string;
  existingMembershipEmail?: string;
}): boolean {
  const actorEmail = normalizeEmail(args.actorEmail);
  const targetKey = normalizeProfileKey(args.targetKey);
  const existingMembershipEmail = args.existingMembershipEmail
    ? normalizeEmail(args.existingMembershipEmail)
    : undefined;
  const derivedKey = deriveProfileKeyFromEmail(actorEmail);

  return (
    targetKey === derivedKey &&
    (!existingMembershipEmail || existingMembershipEmail === actorEmail)
  );
}

export function canEditContributorProfile({
  actorEmail,
  actorRole,
  targetKey,
  existingProfile,
}: SaveProfileAuthorizationInput): boolean {
  if (isEditorRole(actorRole)) {
    return true;
  }

  const normalizedActorEmail = normalizeEmail(actorEmail);
  const existingMembershipEmail = existingProfile?.membershipEmail
    ? normalizeEmail(existingProfile.membershipEmail)
    : undefined;
  const ownsExisting = existingMembershipEmail === normalizedActorEmail;

  return (
    ownsExisting ||
    canClaimContributorProfile({
      actorEmail: normalizedActorEmail,
      targetKey,
      existingMembershipEmail,
    })
  );
}

export function buildStoredProfile(
  input: StoredProfileDraftInput,
  existing: StoredProfile | null,
  actorEmail: string,
  actorRole: ContributorRole,
): Omit<StoredProfile, "createdAt"> {
  const key = normalizeProfileKey(input.key);
  const normalizedActorEmail = normalizeEmail(actorEmail);
  const displayName = sanitizeDisplayName(input.displayName) || toDisplayName(key);
  const bio = sanitizeBio(input.bio);
  const links = sanitizeLinks(input.links);

  let avatarStorageId = existing?.avatarStorageId;
  let avatarUrl = existing?.avatarUrl;

  if (input.avatarStorageId) {
    avatarStorageId = input.avatarStorageId;
    avatarUrl = undefined;
  } else if (input.avatarUrl === null) {
    avatarStorageId = undefined;
    avatarUrl = undefined;
  } else if (input.avatarUrl !== undefined) {
    avatarStorageId = undefined;
    avatarUrl = sanitizeAvatarUrl(input.avatarUrl) ?? undefined;
  }

  const now = new Date().toISOString();
  const existingMembershipEmail = existing?.membershipEmail
    ? normalizeEmail(existing.membershipEmail)
    : undefined;
  const membershipEmail = isEditorRole(actorRole)
    ? existingMembershipEmail
    : canClaimContributorProfile({
        actorEmail: normalizedActorEmail,
        targetKey: key,
        existingMembershipEmail,
      }) || existingMembershipEmail === normalizedActorEmail
      ? normalizedActorEmail
      : existingMembershipEmail;

  return {
    key,
    displayName,
    aliases: existing?.aliases ?? [],
    avatarStorageId,
    avatarUrl,
    bio,
    links,
    membershipEmail,
    updatedAt: now,
    updatedBy: normalizedActorEmail,
  };
}

export async function materializeProfile(
  ctx: StorageCtx,
  profile: StoredProfile,
): Promise<PublicProfile> {
  let resolvedAvatarUrl = sanitizeAvatarUrl(profile.avatarUrl);

  if (profile.avatarStorageId) {
    resolvedAvatarUrl = (await ctx.storage.getUrl(profile.avatarStorageId)) ?? resolvedAvatarUrl;
  }

  return {
    key: normalizeProfileKey(profile.key),
    displayName: sanitizeDisplayName(profile.displayName) || toDisplayName(profile.key),
    aliases: sanitizeAliases(profile.aliases),
    avatarUrl: resolvedAvatarUrl,
    bio: sanitizeBio(profile.bio),
    links: sanitizeLinks(profile.links ?? []),
    hasCustomBio: sanitizeBio(profile.bio).trim().length > 0,
  };
}

export function buildImportedStoredProfile(
  entry: BulkImportProfileInput,
  now = new Date().toISOString(),
) {
  const key = normalizeProfileKey(entry.key);

  if (!key) {
    return null;
  }

  return {
    key,
    displayName: sanitizeDisplayName(entry.displayName) || toDisplayName(key),
    aliases: sanitizeAliases(entry.aliases),
    avatarStorageId: entry.avatarStorageId,
    avatarUrl: sanitizeAvatarUrl(entry.avatarUrl) ?? undefined,
    bio: sanitizeBio(entry.bio),
    links: sanitizeLinks(entry.links),
    membershipEmail: entry.membershipEmail ? normalizeEmail(entry.membershipEmail) : undefined,
    updatedAt: entry.updatedAt ?? now,
    updatedBy: entry.updatedBy ? normalizeEmail(entry.updatedBy) : "system@dosewiki.internal",
    createdAt: entry.createdAt ?? now,
  };
}

export function buildRenamedProfilePatch({
  existingAliases,
  fromKey,
  toKey,
  aliasesToAdd,
}: RenameProfileInput) {
  const normalizedFromKey = normalizeProfileKey(fromKey);
  const normalizedToKey = normalizeProfileKey(toKey);

  if (!normalizedFromKey || !normalizedToKey) {
    throw new Error("Both fromKey and toKey are required.");
  }

  if (normalizedFromKey === normalizedToKey) {
    throw new Error("fromKey and toKey must be different.");
  }

  return {
    fromKey: normalizedFromKey,
    toKey: normalizedToKey,
    patch: {
      key: normalizedToKey,
      aliases: sanitizeAliases([
        ...(existingAliases ?? []),
        normalizedFromKey.toLowerCase(),
        ...(aliasesToAdd ?? []),
      ]),
      updatedAt: new Date().toISOString(),
    },
  };
}
