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
  membershipEmail: v.optional(v.union(v.string(), v.null())),
  exclude_from_gallery: v.optional(v.boolean()),
  archival: v.optional(v.boolean()),
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

export type ContributorRole = "admin" | "editor" | "viewer" | undefined;

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
  avatarUrl?: string;
  bio: string;
  role?: string;
  links: ProfileLink[];
  membershipEmail?: string;
  replicationOrder?: string[];
  reportOrder?: string[];
  exclude_from_gallery?: boolean;
  archival?: boolean;
  staffNote?: StaffNote;
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

const LEGACY_CREDENTIAL_EMAIL_DOMAIN = "@local.dose.wiki";

/**
 * Every email whose editorial-review stamps belong to one contributor profile.
 *
 * `setEditorialReview` stamps the reviewing actor's email, and legacy
 * credential logins derive that email from the login key
 * (`<key>@local.dose.wiki`). A profile therefore claims its `membershipEmail`
 * plus the legacy credential email of its key and of every alias — so stamps
 * made under a retired login handle (witchy@local.dose.wiki) follow the
 * profile that absorbed the alias (LYREA). Alias-derived emails are confined
 * to the internal legacy domain, so an alias can never claim an external
 * address. Callers must keep the returned set server-side.
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
  for (const handle of [profile.key, ...(profile.aliases ?? [])]) {
    const normalized = handle.trim().toLowerCase();
    // A legacy credential key is a bare handle; anything with whitespace (a
    // display-name alias like "josie kins") never was a login key.
    if (normalized && !/\s/.test(normalized)) {
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

/** Upper bound on a curated ordering, so one write cannot pin an unbounded list. */
export const MAX_ORDER_SLUGS = 500;

/**
 * Trim, drop blanks, and de-duplicate an ordering while preserving the caller's
 * order. Slugs are compared exactly rather than case-folded: the tables store
 * lowercase URL slugs, and lowercasing here would silently rewrite — and then
 * prune — anything that did not follow that convention.
 */
export function normalizeOrderSlugs(values: readonly string[] | null | undefined): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];

  for (const value of values ?? []) {
    const slug = typeof value === "string" ? value.trim() : "";
    if (!slug || seen.has(slug)) {
      continue;
    }
    seen.add(slug);
    ordered.push(slug);
    if (ordered.length >= MAX_ORDER_SLUGS) {
      break;
    }
  }

  return ordered;
}

/**
 * Split a requested ordering into the slugs that still resolve to a row and the
 * stale ones. Curation is partial: the surviving slugs render first in this
 * order and every unlisted item follows in its existing default sort, so a
 * pruned slug costs nothing but its own position.
 */
export function pruneOrderSlugs(
  requested: readonly string[] | null | undefined,
  knownSlugs: Iterable<string>,
): { order: string[]; pruned: string[] } {
  const known = new Set(knownSlugs);
  const order: string[] = [];
  const pruned: string[] = [];

  for (const slug of normalizeOrderSlugs(requested)) {
    if (known.has(slug)) {
      order.push(slug);
    } else {
      pruned.push(slug);
    }
  }

  return { order, pruned };
}

export type EditorProfilePatchInput = {
  displayName?: string;
  bio?: string;
  role?: string | null;
  links?: ProfileLink[];
  aliases?: string[];
  avatarUrl?: string | null;
  avatarStorageId?: string | null;
  membershipEmail?: string | null;
  exclude_from_gallery?: boolean;
  archival?: boolean;
  staffNote?: StaffNote | null;
};

/**
 * Build the `ctx.db.patch` payload for an editor profile edit.
 *
 * A key is present in the returned object only when the caller asked for that
 * field to change, because Convex reads a present-but-`undefined` value as
 * "delete this field". That is exactly how a clear is expressed here, and it is
 * why an omitted field must not appear at all.
 */
export function buildEditorProfilePatch(
  input: EditorProfilePatchInput,
  existing: StoredProfile,
  actorEmail: string,
  now = new Date().toISOString(),
): Record<string, unknown> {
  const patch: Record<string, unknown> = {
    updatedAt: now,
    updatedBy: normalizeEmail(actorEmail),
  };

  // A blank display name would leave the profile with no renderable name, so it
  // falls back to what is stored rather than being accepted as a clear.
  const nextDisplayName =
    input.displayName === undefined
      ? existing.displayName
      : sanitizeDisplayName(input.displayName) ||
        existing.displayName ||
        toDisplayName(existing.key);

  if (input.displayName !== undefined) {
    patch.displayName = nextDisplayName;
  }

  if (input.bio !== undefined) {
    patch.bio = sanitizeBio(input.bio);
  }

  if (input.role !== undefined) {
    patch.role = input.role === null ? undefined : sanitizeRole(input.role) || undefined;
  }

  if (input.links !== undefined) {
    patch.links = sanitizeLinks(input.links);
  }

  // Whatever the profile answers to has to keep resolving. An explicit alias
  // list replaces the stored one so an editor can drop a wrong alias, but the
  // key and the current display name are always folded back in; a rename alone
  // still has to add the new name without disturbing the existing aliases.
  if (input.aliases !== undefined) {
    patch.aliases = sanitizeAliases([
      ...input.aliases,
      existing.key.toLowerCase(),
      nextDisplayName,
    ]);
  } else if (input.displayName !== undefined) {
    patch.aliases = sanitizeAliases([
      ...(existing.aliases ?? []),
      existing.key.toLowerCase(),
      nextDisplayName,
    ]);
  }

  const requestedStorageId =
    typeof input.avatarStorageId === "string" ? input.avatarStorageId.trim() : input.avatarStorageId;

  if (typeof requestedStorageId === "string" && requestedStorageId) {
    patch.avatarStorageId = requestedStorageId;
    patch.avatarUrl = undefined;
  } else if (input.avatarUrl === null) {
    patch.avatarStorageId = undefined;
    patch.avatarUrl = undefined;
  } else if (input.avatarUrl !== undefined) {
    patch.avatarStorageId = undefined;
    patch.avatarUrl = sanitizeAvatarUrl(input.avatarUrl) ?? undefined;
  } else if (requestedStorageId === null || requestedStorageId === "") {
    patch.avatarStorageId = undefined;
    patch.avatarUrl = undefined;
  }

  if (input.membershipEmail !== undefined) {
    const email = input.membershipEmail === null ? "" : normalizeEmail(input.membershipEmail);
    patch.membershipEmail = email || undefined;
  }

  // Stored as `true` or not at all: absent is the "included" default, so a
  // toggle back to included deletes the field (present-but-`undefined`)
  // rather than storing a `false` that reads would then have to treat as
  // absent anyway.
  if (input.exclude_from_gallery !== undefined) {
    patch.exclude_from_gallery = input.exclude_from_gallery === true ? true : undefined;
  }

  // Same true-or-delete contract as the gallery flag: absent is the "normal
  // profile" default, so unchecking deletes the field.
  if (input.archival !== undefined) {
    patch.archival = input.archival === true ? true : undefined;
  }

  // `null` (or a note emptied down to nothing) clears the field; a kept note is
  // stored sanitized, with the attribution omitted entirely when blank.
  if (input.staffNote !== undefined) {
    const markdown = input.staffNote === null ? "" : sanitizeBio(input.staffNote.markdown);
    if (!markdown.trim()) {
      patch.staffNote = undefined;
    } else {
      const attribution =
        input.staffNote === null ? "" : sanitizeRole(input.staffNote.attribution);
      patch.staffNote = attribution ? { markdown, attribution } : { markdown };
    }
  }

  return patch;
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
    // Read-side passthrough only. Consumers still own the merge: listed slugs
    // first in this order, everything else after in the default sort, and any
    // slug that no longer matches an item is simply not found and ignored.
    replicationOrder: normalizeOrderSlugs(profile.replicationOrder),
    reportOrder: normalizeOrderSlugs(profile.reportOrder),
    // Passthrough of the gallery opt-out; spread so an included profile's
    // public projection carries no key at all rather than an explicit false.
    ...(profile.exclude_from_gallery === true ? { exclude_from_gallery: true } : {}),
    ...(profile.archival === true ? { archival: true } : {}),
    // Passthrough of the staff commentary; spread so an absent note stays a
    // missing key rather than an explicit null.
    ...(profile.staffNote?.markdown ? { staffNote: profile.staffNote } : {}),
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
