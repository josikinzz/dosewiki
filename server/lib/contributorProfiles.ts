import { v } from "../../lib/postgres/runtime/values";
import type { Id } from "../../lib/postgres/runtime/dataModel";
import type { AppRole } from "../../src/lib/auth/roles";
import {
  deriveProfileKeyFromEmail,
  expandLegacyContributorHandles,
  findContributorProfileByKeyOrAlias,
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
export { materializeProfile } from "./contributorProfileMaterialization";
export {
  MAX_ORDER_SLUGS,
  normalizeOrderSlugs,
  pruneOrderSlugs,
} from "./contributorProfileOrdering";
export {
  buildEditorProfilePatch,
  type EditorProfilePatchInput,
} from "./contributorProfilePatches";

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
  avatarR2Key: v.optional(v.string()),
});

export const editorProfilePatchValidator = v.object({
  displayName: v.optional(v.string()),
  bio: v.optional(v.string()),
  role: contributorRoleValidator,
  links: v.optional(v.array(linkValidator)),
  aliases: v.optional(v.array(v.string())),
  avatarUrl: v.optional(v.union(v.string(), v.null())),
  avatarStorageId: v.optional(v.union(v.string(), v.null())),
  avatarR2Key: v.optional(v.string()),
  membershipEmail: v.optional(v.union(v.string(), v.null())),
  exclude_from_gallery: v.optional(v.boolean()),
  archival: v.optional(v.boolean()),
  approved_replicator: v.optional(v.boolean()),
  staffNote: v.optional(
    v.union(
      v.object({
        markdown: v.string(),
        attribution: v.optional(v.string()),
      }),
      v.null(),
    ),
  ),
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

export type ContributorRole = AppRole | undefined;

export type ProfileLink = {
  label: string;
  url: string;
};

export type StaffNote = {
  markdown: string;
  attribution?: string;
};

export type StoredProfile = {
  key: string;
  displayName: string;
  aliases: string[];
  avatarStorageId?: string;
  avatarR2Key?: string;
  avatarUrl?: string;
  bio: string;
  role?: string;
  links: ProfileLink[];
  membershipEmail?: string;
  replicationOrder?: string[];
  reportOrder?: string[];
  exclude_from_gallery?: boolean;
  archival?: boolean;
  approved_replicator?: boolean;
  staffNote?: StaffNote;
  createdAt: string;
  updatedAt: string;
  updatedBy?: string;
  mergedIntoProfileId?: Id<"contributorProfiles">;
  mergedIntoKey?: string;
  mergedByOperationId?: string;
  mergedAt?: number;
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
  replicationOrder: string[];
  reportOrder: string[];
  exclude_from_gallery?: boolean;
  archival?: boolean;
  approved_replicator?: boolean;
  staffNote?: StaffNote;
};

type StoredProfileDraftInput = {
  key: string;
  displayName: string;
  bio: string;
  role?: string | null;
  links: ProfileLink[];
  avatarUrl?: string | null;
  avatarStorageId?: string;
  avatarR2Key?: string;
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

const LEGACY_CREDENTIAL_EMAIL_DOMAIN = "@local.dose.wiki";

export function contributorReviewerEmails(
  profile: Pick<StoredProfile, "key" | "aliases" | "membershipEmail">,
): Set<string> {
  const emails = new Set<string>();
  if (profile.membershipEmail) {
    const email = normalizeEmail(profile.membershipEmail);
    if (email) {
      emails.add(email);
    }
  }
  for (const handle of expandLegacyContributorHandles([
    profile.key,
    ...(profile.aliases ?? []),
  ])) {
    const normalized = handle.toLowerCase();
    if (!/\s/.test(normalized)) {
      emails.add(`${normalized}${LEGACY_CREDENTIAL_EMAIL_DOMAIN}`);
    }
  }
  return emails;
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
  if (actorRole === "admin") {
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
  _actorRole: ContributorRole,
): Omit<StoredProfile, "createdAt"> {
  const key = resolveOwnedProfileKey(input.key, actorEmail);
  const normalizedActorEmail = normalizeEmail(actorEmail);
  const displayName = sanitizeDisplayName(input.displayName) || toDisplayName(key);
  const bio = sanitizeBio(input.bio);
  const links = sanitizeLinks(input.links);
  const role =
    input.role === undefined ? existing?.role : sanitizeRole(input.role) || undefined;

  let avatarStorageId = existing?.avatarStorageId;
  let avatarR2Key = existing?.avatarR2Key;
  let avatarUrl = existing?.avatarUrl;

  if (input.avatarR2Key) {
    avatarR2Key = input.avatarR2Key;
    avatarStorageId = undefined;
    avatarUrl = undefined;
  } else if (input.avatarStorageId) {
    avatarStorageId = input.avatarStorageId;
    avatarR2Key = undefined;
    avatarUrl = undefined;
  } else if (input.avatarUrl === null) {
    avatarStorageId = undefined;
    avatarR2Key = undefined;
    avatarUrl = undefined;
  } else if (input.avatarUrl !== undefined) {
    avatarStorageId = undefined;
    avatarR2Key = undefined;
    avatarUrl = sanitizeAvatarUrl(input.avatarUrl) ?? undefined;
  }

  const now = new Date().toISOString();
  const existingMembershipEmail = existing?.membershipEmail
    ? normalizeEmail(existing.membershipEmail)
    : undefined;
  const membershipEmail =
    canClaimContributorProfile({
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
    avatarR2Key,
    avatarUrl,
    bio,
    role,
    links,
    membershipEmail,
    updatedAt: now,
    updatedBy: normalizedActorEmail,
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
