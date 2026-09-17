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
  avatarR2Key: v.optional(v.string()),
});

/**
 * Editor-side profile patch. Every field is optional and an omitted field is
 * left exactly as stored — this is the deliberate opposite of `bulkImport`,
 * which patches every field it names and therefore clears anything the caller
 * did not carry forward. `null` is the only way to clear a clearable field.
 *
 * Ordering is not here on purpose: `setContributorOrdering` owns it, because
 * ordering writes have to be pruned against the replication and trip report
 * tables and this patch performs no table lookups.
 */
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

/** Signed staff commentary shown as the public "Editor's note" section. */
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
  // Partial curation, read-side only for now: the listed slugs are the ones the
  // contributor pinned to the front, in order. Consumers place them first and
  // fall back to their existing default sort for everything unlisted.
  replicationOrder: string[];
  reportOrder: string[];
  // Present (and `true`) only when the contributor opted out of the public
  // /replications gallery. Absent means included.
  exclude_from_gallery?: boolean;
  // Present (and `true`) only for a staff-maintained archival profile. Absent
  // means a normal profile.
  archival?: boolean;
  // Present (and `true`) only for an artist dose.wiki endorses as an approved
  // replicator. Absent means an ordinary artist.
  approved_replicator?: boolean;
  // Signed staff commentary. Absent means the section renders nothing.
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

/**
 * Every email whose editorial-review stamps belong to one contributor profile.
 *
 * `setEditorialReview` stamps the reviewing actor's email, and legacy
 * credential logins derive that email from the login key
 * (`<key>@local.dose.wiki`). A profile therefore claims its `membershipEmail`
 * plus the legacy credential email of its key, of every alias, and of every
 * retired handle in its legacy group (the `LEGACY_CONTRIBUTOR_HANDLE_GROUPS`
 * environment variable), so stamps made under a retired login handle follow
 * the profile that absorbed it even though the handle was scrubbed from the
 * stored aliases, which unauthenticated profile reads ship verbatim.
 * Alias-derived emails are confined to the internal legacy domain, so an
 * alias can never claim an external address. Callers must keep the returned
 * set server-side.
 */
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
    // A legacy credential key is a bare handle; anything with whitespace (a
    // display-name alias like "josie kins") never was a login key.
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

/**
 * Ownership rule for a contributor profile write. An admin edits any record.
 * Everyone else, editors included, edits only the record whose membership
 * email is theirs, or the still-unclaimed record their sign-in derives to.
 * Editors read every record (`getEditorProfile`); this is the write half.
 */
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
  // The self-serve profile editor does not submit a role, so an omitted role
  // must keep whatever is stored rather than silently clearing a title the
  // migration assigned. An explicit null is the only way to clear it.
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
