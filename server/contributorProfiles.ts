import { v } from "../lib/postgres/runtime/values";
import { query, type MutationCtx } from "../lib/postgres/runtime/server";
import { mutation } from "./lib/indexedMutation";
import { requireRole } from "./lib/auth";
import {
  buildImportedStoredProfile,
  buildRenamedProfilePatch,
  bulkImportProfileValidator,
  editorProfilePatchValidator,
  materializeProfile,
  normalizeProfileKey,
  profileInputValidator,
  type StoredProfile,
  deriveProfileKeyFromEmail,
  normalizeEmail,
} from "./lib/contributorProfiles";
import { setContributorOrderingHandler } from "./lib/contributorProfileOrderingHandlers";
import {
  attributionAliasesForProfile,
  getStoredContributorProfile,
} from "./lib/contributorProfilePersistence";
import {
  getAllContributorProfilesHandler,
  getContributorProfileByKeyHandler,
  getContributorProfileKeysHandler,
  getContributorProfilesForBulkImportHandler,
  getEditorContributorProfileHandler,
  getOwnedContributorProfileHandler,
} from "./lib/contributorProfileReadHandlers";
import {
  deleteContributorProfileHandler,
  authorizeContributorAvatarUploadHandler,
  mergeContributorProfileHandler,
  retargetTripReportsToContributorHandler,
  saveContributorProfileAsEditorHandler,
  saveContributorProfileHandler,
  readContributorProfilePublicationHandler,
} from "./lib/contributorProfileWriteHandlers";
import {
  importReviewedProfilePlanHandler,
  rollbackReviewedProfilePlanHandler,
  reviewedProfileImportArgs,
  reviewedProfileImportResult,
  reviewedProfileRollbackArgs,
  reviewedProfileRollbackResult,
} from "./lib/contributorProfileImports";

async function patchReportsForContributorKey(
  ctx: MutationCtx,
  authorNames: string[],
  contributorKey: string,
  embeddedAuthorName?: string,
) {
  const acceptedNames = new Set(
    authorNames.map((name) => name.trim().toLowerCase()).filter(Boolean),
  );
  const normalizedContributorKey = normalizeProfileKey(contributorKey);
  const allReports = await ctx.db.query("tripReports").collect();
  let updated = 0;
  for (const report of allReports) {
    const matchesAuthor = acceptedNames.has(report.subject.name.trim().toLowerCase());
    const matchesContributorKey = report.subject.profile_key === normalizedContributorKey;
    if (!matchesAuthor && !matchesContributorKey) continue;
    await ctx.db.patch(report._id, {
      subject: {
        ...report.subject,
        name: embeddedAuthorName ?? report.subject.name,
        profile_key: normalizedContributorKey,
      },
    });
    updated += 1;
  }
  return updated;
}

export const getAll = query({
  args: {},
  handler: getAllContributorProfilesHandler,
});

export const getPublicIdentities = query({
  args: { lookupKeys: v.optional(v.array(v.string())) },
  handler: async (ctx, args) => {
    const db = ctx.db as typeof ctx.db & {
      getPublicContributorIdentities: (lookupKeys?: readonly string[]) => Promise<StoredProfile[]>;
    };
    const rows = await db.getPublicContributorIdentities(args.lookupKeys);
    const profiles = await Promise.all(rows
      .filter((row) => !row.mergedIntoProfileId)
      .map((row) => materializeProfile(ctx, {
        key: row.key, displayName: row.displayName, aliases: row.aliases,
        avatarUrl: row.avatarUrl, avatarR2Key: row.avatarR2Key, avatarStorageId: row.avatarStorageId,
        exclude_from_gallery: row.exclude_from_gallery, approved_replicator: row.approved_replicator,
        archival: row.archival, bio: "", links: [],
      } as StoredProfile)));
    return profiles.sort((left, right) => left.displayName.localeCompare(right.displayName));
  },
});

export const getKeys = query({
  args: {},
  handler: getContributorProfileKeysHandler,
});

export const getByKey = query({
  args: { key: v.string() },
  handler: getContributorProfileByKeyHandler,
});

// Import-only raw profile read; deliberately bypasses public materialization.
export const getForBulkImport = query({
  args: {
    apiKey: v.optional(v.string()),
    actorEmail: v.optional(v.string()),
    keys: v.array(v.string()),
  },
  handler: getContributorProfilesForBulkImportHandler,
});

export const getEditorProfile = query({
  args: {
    apiKey: v.optional(v.string()),
    actorEmail: v.optional(v.string()),
    key: v.string(),
  },
  handler: getEditorContributorProfileHandler,
});

export const getOwnedProfile = query({
  args: {
    apiKey: v.optional(v.string()),
    email: v.string(),
  },
  handler: getOwnedContributorProfileHandler,
});

/**
 * Minimal ownership lookup for route shells that need only the canonical
 * profile key. This deliberately mirrors getOwnedProfile's membership-email
 * precedence and guarded email-derived fallback without materializing avatar,
 * bio, links, or ordering data.
 */
export const getOwnedProfileKey = query({
  args: {
    apiKey: v.optional(v.string()),
    email: v.string(),
  },
  handler: async (ctx, args) => {
    const actor = await requireRole(
      ctx,
      {
        apiKey: args.apiKey,
        adminIntent: "profileMediaWrite",
        actorEmail: args.apiKey ? args.email : undefined,
      },
      "contributor",
    );
    const email = actor.email;
    const directMatch = await ctx.db
      .query("contributorProfiles")
      .withIndex("by_membership_email", (query) => query.eq("membershipEmail", email))
      .first();
    if (directMatch) return directMatch.key;

    const derivedKey = deriveProfileKeyFromEmail(email);
    if (!derivedKey) return null;
    const fallbackMatch = await getStoredContributorProfile(ctx, derivedKey);
    if (!fallbackMatch) return null;
    const membershipEmail = fallbackMatch.membershipEmail
      ? normalizeEmail(fallbackMatch.membershipEmail)
      : undefined;
    if (membershipEmail && membershipEmail !== email) return null;
    return fallbackMatch.key;
  },
});


export const authorizeAvatarUpload = query({
  args: {
    apiKey: v.optional(v.string()),
    actorEmail: v.string(),
    key: v.string(),
    expectedUpdatedAt: v.union(v.string(), v.null()),
    selfServe: v.boolean(),
    patch: editorProfilePatchValidator,
  },
  handler: authorizeContributorAvatarUploadHandler,
});

export const saveProfile = mutation({
  args: {
    apiKey: v.optional(v.string()),
    actorEmail: v.string(),
    profile: profileInputValidator,
    expectedUpdatedAt: v.union(v.string(), v.null()),
    operationId: v.optional(v.string()),
    clientRequestIdentity: v.optional(v.string()),
    avatarR2Receipt: v.optional(v.string()),
  },
  handler: saveContributorProfileHandler,
});

export const bulkImport = mutation({
  args: {
    apiKey: v.optional(v.string()),
    actorEmail: v.optional(v.string()),
    profiles: v.array(bulkImportProfileValidator),
  },
  handler: async (ctx, args) => {
    await requireRole(
      ctx,
      { apiKey: args.apiKey, actorEmail: args.actorEmail, adminIntent: "profileMediaWrite" },
      "admin",
    );
    let created = 0;
    let updated = 0;
    for (const entry of args.profiles) {
      const data = buildImportedStoredProfile(entry);
      if (!data) continue;
      const existing = await getStoredContributorProfile(ctx, data.key);
      if (existing) {
        await ctx.db.patch(existing._id, {
          key: data.key,
          displayName: data.displayName,
          aliases: data.aliases,
          avatarStorageId: data.avatarStorageId,
          // Legacy bulk import is a full replacement and cannot introduce an
          // unverified R2 key. Clear any older R2 avatar so a Storage/URL
          // replacement is not shadowed by R2 read precedence.
          avatarR2Key: undefined,
          avatarUrl: data.avatarUrl,
          bio: data.bio,
          role: data.role,
          links: data.links,
          membershipEmail: data.membershipEmail,
          updatedAt: data.updatedAt,
          updatedBy: data.updatedBy,
        });
        updated += 1;
      } else {
        await ctx.db.insert("contributorProfiles", data);
        created += 1;
      }
    }
    return { created, updated };
  },
});

/** Guarded, idempotent intake for reviewed Replication Index profile outcomes. */
export const importReviewedProfilePlan = mutation({
  args: reviewedProfileImportArgs.fields,
  returns: reviewedProfileImportResult,
  handler: importReviewedProfilePlanHandler,
});

/** Guarded, exact rollback for reviewed Replication Index profile outcomes. */
export const rollbackReviewedProfilePlan = mutation({
  args: reviewedProfileRollbackArgs.fields,
  returns: reviewedProfileRollbackResult,
  handler: rollbackReviewedProfilePlanHandler,
});

export const renameKey = mutation({
  args: {
    apiKey: v.optional(v.string()),
    actorEmail: v.optional(v.string()),
    fromKey: v.string(),
    toKey: v.string(),
    aliasesToAdd: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    await requireRole(
      ctx,
      { apiKey: args.apiKey, actorEmail: args.actorEmail, adminIntent: "profileMediaWrite" },
      "admin",
    );
    const rename = buildRenamedProfilePatch({
      existingAliases: undefined,
      fromKey: args.fromKey,
      toKey: args.toKey,
      aliasesToAdd: args.aliasesToAdd,
    });
    const existing = await getStoredContributorProfile(ctx, rename.fromKey);
    if (!existing) throw new Error(`Profile "${rename.fromKey}" not found.`);
    const conflicting = await getStoredContributorProfile(ctx, rename.toKey);
    if (conflicting) throw new Error(`Profile "${rename.toKey}" already exists.`);
    const finalizedRename = buildRenamedProfilePatch({
      existingAliases: attributionAliasesForProfile(
        existing as StoredProfile,
        args.aliasesToAdd,
      ),
      fromKey: rename.fromKey,
      toKey: rename.toKey,
      aliasesToAdd: args.aliasesToAdd,
    });
    await ctx.db.patch(existing._id, finalizedRename.patch);
    const reportsUpdated = await patchReportsForContributorKey(
      ctx,
      [rename.fromKey],
      rename.toKey,
    );
    const updated = await getStoredContributorProfile(ctx, rename.toKey);
    return {
      profile: updated ? await materializeProfile(ctx, updated as StoredProfile) : null,
      reportsUpdated,
      revalidate: {
        contributorKeys: [rename.fromKey, rename.toKey],
        reportSlugs: [] as string[],
      },
    };
  },
});

export const deleteProfile = mutation({
  args: {
    apiKey: v.optional(v.string()),
    actorEmail: v.optional(v.string()),
    key: v.string(),
    confirmDelete: v.boolean(),
  },
  handler: deleteContributorProfileHandler,
});

export const mergeProfileInto = mutation({
  args: {
    apiKey: v.optional(v.string()),
    actorEmail: v.optional(v.string()),
    fromKey: v.string(),
    toKey: v.string(),
    discardSourceContent: v.optional(v.boolean()),
  },
  handler: mergeContributorProfileHandler,
});

export const retargetTripReportsToContributor = mutation({
  args: {
    apiKey: v.optional(v.string()),
    actorEmail: v.string(),
    authorName: v.string(),
    contributorKey: v.string(),
    embeddedAuthorName: v.optional(v.string()),
  },
  handler: retargetTripReportsToContributorHandler,
});

export const saveProfileAsEditor = mutation({
  args: {
    apiKey: v.optional(v.string()),
    actorEmail: v.optional(v.string()),
    key: v.string(),
    patch: editorProfilePatchValidator,
    expectedUpdatedAt: v.union(v.string(), v.null()),
    operationId: v.optional(v.string()),
    clientRequestIdentity: v.optional(v.string()),
    avatarR2Receipt: v.optional(v.string()),
  },
  handler: saveContributorProfileAsEditorHandler,
});

export const getPublicationReceipt = query({
  args: {
    apiKey: v.optional(v.string()),
    actorEmail: v.string(),
    key: v.string(),
    operationId: v.string(),
    clientRequestIdentity: v.string(),
  },
  handler: readContributorProfilePublicationHandler,
});

export const setContributorOrdering = mutation({
  args: {
    apiKey: v.optional(v.string()),
    actorEmail: v.optional(v.string()),
    key: v.string(),
    replicationOrder: v.optional(v.array(v.string())),
    expectedReplicationOrder: v.optional(v.array(v.string())),
    expectedRevision: v.optional(v.string()),
    reportOrder: v.optional(v.array(v.string())),
  },
  handler: setContributorOrderingHandler,
});
