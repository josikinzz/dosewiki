import { v } from "convex/values";
import {
  deriveProfileKeyFromEmail,
  findContributorProfileByKeyOrAlias,
  materializeContributorProfile,
  normalizeContributorEmail,
  normalizeProfileAliases,
  normalizeProfileKey,
  resolveOwnedProfileKey,
  sanitizeContributorAvatarUrl,
  sanitizeContributorBio,
  sanitizeContributorDisplayName,
  sanitizeContributorLinks,
  sanitizeContributorRole,
  toContributorDisplayName,
} from "../../lib/contributorProfileIdentity";

// Authorization role. Distinct from the contributor's free-text `role` title
// below, which is presentation-only and carries no privileges.
export const roleValidator = v.union(v.literal("admin"), v.literal("editor"), v.literal("viewer"));

// Contributor title. `null` clears it; `undefined` leaves whatever is stored.
export const contributorRoleValidator = v.optional(v.union(v.string(), v.null()));

export const linkValidator = v.object({
  label: v.string(),
  url: v.string(),
});

export const profileInputValidator = v.object({
  key: v.string(),
  displayName: v.string(),
  bio: v.string(),
  role: contributorRoleValidator,
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
  role: v.optional(v.string()),
  links: v.array(linkValidator),
  membershipEmail: v.optional(v.string()),
  createdAt: v.optional(v.string()),
  updatedAt: v.optional(v.string()),
  updatedBy: v.optional(v.string()),
});

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
  role?: string;
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
  role?: string;
};

type StoredProfileDraftInput = {
  key: string;
  displayName: string;
  bio: string;
  role?: string | null;
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
  role?: string;
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

export {
  deriveProfileKeyFromEmail,
  findContributorProfileByKeyOrAlias,
  normalizeProfileKey,
  resolveOwnedProfileKey,
};

export function normalizeEmail(value: string): string {
  return normalizeContributorEmail(value);
}

export function toDisplayName(key: string, fallback = "Contributor"): string {
  return toContributorDisplayName(key, fallback);
}

export function sanitizeDisplayName(value: string): string {
  return sanitizeContributorDisplayName(value);
}

export function sanitizeBio(value: string): string {
  return sanitizeContributorBio(value);
}

export function sanitizeRole(value: string | null | undefined): string {
  return sanitizeContributorRole(value);
}

export function sanitizeAvatarUrl(value: string | null | undefined): string | null {
  return sanitizeContributorAvatarUrl(value);
}

export function sanitizeAliases(value: string[] | undefined): string[] {
  return normalizeProfileAliases(value);
}

export function sanitizeLinks(links: ProfileLink[]): ProfileLink[] {
  return sanitizeContributorLinks(links);
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
  const key = resolveOwnedProfileKey(input.key, actorEmail);
  const normalizedActorEmail = normalizeEmail(actorEmail);
  const displayName = sanitizeDisplayName(input.displayName) || toDisplayName(key);
  const bio = sanitizeBio(input.bio);
  const links = sanitizeLinks(input.links);
  // The self-serve profile editor does not submit a role, so an omitted role
  // must keep whatever is stored rather than silently clearing a title the
  // migration assigned. An explicit null is the only way to clear it.
  const role =
    input.role === undefined ? existing?.role : sanitizeRole(input.role) || undefined;

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
    role,
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
    ...(materializeContributorProfile({
      key: profile.key,
      displayName: profile.displayName,
      aliases: profile.aliases,
      avatarUrl: resolvedAvatarUrl,
      bio: profile.bio,
      links: profile.links,
      role: profile.role,
    }) ?? {
      key: "CONTRIBUTOR",
      displayName: "Contributor",
      aliases: [],
      avatarUrl: null,
      bio: "",
      links: [],
      hasCustomBio: false,
    }),
    avatarUrl: resolvedAvatarUrl ?? null,
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
    role: sanitizeRole(entry.role) || undefined,
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
