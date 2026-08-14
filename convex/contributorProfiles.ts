import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { requireAuthenticatedWrite, requireEditorWrite } from "./lib/auth";
import {
  buildImportedStoredProfile,
  buildEditorProfilePatch,
  buildRenamedProfilePatch,
  buildStoredProfile,
  bulkImportProfileValidator,
  canEditContributorProfile,
  deriveProfileKeyFromEmail,
  editorProfilePatchValidator,
  materializeProfile,
  normalizeEmail,
  normalizeOrderSlugs,
  normalizeProfileKey,
  profileInputValidator,
  pruneOrderSlugs,
  resolveOwnedProfileKey,
  sanitizeAliases,
  type StoredProfile,
} from "./lib/contributorProfiles";

async function getStoredByKey(ctx: QueryCtx | MutationCtx, key: string) {
  return await ctx.db
    .query("contributorProfiles")
    .withIndex("by_key", (query) => query.eq("key", normalizeProfileKey(key)))
    .first();
}

function attributionAliasesForProfile(existingProfile: StoredProfile | null, requestedAliases: string[] = []) {
  return sanitizeAliases([
    ...(existingProfile?.aliases ?? []),
    ...(existingProfile?.displayName ? [existingProfile.displayName] : []),
    existingProfile?.key?.toLowerCase() ?? "",
    ...requestedAliases,
  ]);
}

function contributorProfileRevalidationKeys(profileKey: string, aliases: readonly string[] | undefined) {
  return sanitizeAliases([profileKey, ...(aliases ?? [])]).map((key) => normalizeProfileKey(key));
}

async function patchReportsForContributorKey(
  ctx: MutationCtx,
  authorNames: string[],
  contributorKey: string,
  embeddedAuthorName?: string,
) {
  const acceptedNames = new Set(authorNames.map((name) => name.trim().toLowerCase()).filter(Boolean));
  const normalizedContributorKey = normalizeProfileKey(contributorKey);
  const allReports = await ctx.db.query("tripReports").collect();
  let updated = 0;

  for (const report of allReports) {
    const subjectName = report.subject.name.trim().toLowerCase();
    const matchesAuthor = acceptedNames.has(subjectName);
    const matchesContributorKey = report.subject.profile_key === normalizedContributorKey;

    if (!matchesAuthor && !matchesContributorKey) {
      continue;
    }

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
  handler: async (ctx) => {
    const profiles = await ctx.db.query("contributorProfiles").collect();
    const resolved = await Promise.all(
      profiles.map(async (profile) => await materializeProfile(ctx, profile as StoredProfile)),
    );

    return resolved.sort((left, right) => left.displayName.localeCompare(right.displayName));
  },
});

export const getKeys = query({
  args: {},
  handler: async (ctx) => {
    const profiles = await ctx.db.query("contributorProfiles").collect();
    return profiles
      .map((profile) => normalizeProfileKey(profile.key))
      .filter(Boolean)
      .sort((left, right) => left.localeCompare(right));
  },
});

export const getByKey = query({
  args: {
    key: v.string(),
  },
  handler: async (ctx, args) => {
    const profile = await getStoredByKey(ctx, args.key);
    if (!profile) {
      return null;
    }

    return await materializeProfile(ctx, profile as StoredProfile);
  },
});

// Import-only raw profile read. This deliberately bypasses materialization so
// migration scripts can preserve existing avatar storage IDs and other
// non-empty fields when calling the established bulkImport mutation.
export const getForBulkImport = query({
  args: {
    apiKey: v.optional(v.string()),
    keys: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    await requireEditorWrite(ctx, {
      apiKey: args.apiKey,
      adminIntent: "profileMediaWrite",
    });

    const profiles = await Promise.all(
      Array.from(new Set(args.keys.map((key) => normalizeProfileKey(key)).filter(Boolean))).map(
        async (key) => await getStoredByKey(ctx, key),
      ),
    );

    return profiles.filter((profile): profile is NonNullable<typeof profile> => profile !== null);
  },
});

/**
 * Editor read of one profile, including the fields the public projection
 * deliberately drops.
 *
 * `getAll` returns `PublicProfile`, which carries no `membershipEmail` and no
 * `avatarStorageId` — correct for a public page, but those are exactly the two
 * fields the editor form has to round-trip: an omitted `membershipEmail` in a
 * patch means "leave it", so the form cannot tell "unset" from "unknown"
 * without reading the stored value first.
 *
 * Deliberately not `getForBulkImport`: that one is keyed by an array and
 * returns raw rows for the migration path, unmaterialized on purpose. This
 * resolves the stored avatar to a URL so the editor previews what the public
 * page shows.
 */
export const getEditorProfile = query({
  args: {
    apiKey: v.optional(v.string()),
    actorEmail: v.optional(v.string()),
    key: v.string(),
  },
  handler: async (ctx, args) => {
    await requireEditorWrite(ctx, {
      apiKey: args.apiKey,
      actorEmail: args.actorEmail,
      adminIntent: "profileMediaWrite",
    });

    const key = normalizeProfileKey(args.key);
    if (!key) {
      return null;
    }

    const existing = await getStoredByKey(ctx, key);
    if (!existing) {
      return null;
    }

    const stored = existing as StoredProfile;
    const storedAvatarUrl = stored.avatarStorageId
      ? await ctx.storage.getUrl(stored.avatarStorageId)
      : null;

    return {
      key: normalizeProfileKey(stored.key),
      displayName: stored.displayName,
      aliases: stored.aliases ?? [],
      bio: stored.bio ?? "",
      role: stored.role ?? null,
      links: stored.links ?? [],
      membershipEmail: stored.membershipEmail ?? null,
      avatarUrl: stored.avatarUrl ?? null,
      avatarStorageId: stored.avatarStorageId ?? null,
      storedAvatarUrl,
      replicationOrder: normalizeOrderSlugs(stored.replicationOrder),
      reportOrder: normalizeOrderSlugs(stored.reportOrder),
      exclude_from_gallery: stored.exclude_from_gallery === true,
      archival: stored.archival === true,
      staffNote: stored.staffNote ?? null,
      updatedAt: stored.updatedAt ?? null,
      updatedBy: stored.updatedBy ?? null,
    };
  },
});

export const getOwnedProfile = query({
  args: {
    apiKey: v.optional(v.string()),
    email: v.string(),
  },
  handler: async (ctx, args) => {
    const actor = await requireAuthenticatedWrite(ctx, {
      apiKey: args.apiKey,
      adminIntent: "profileMediaWrite",
      actorEmail: args.apiKey ? args.email : undefined,
    });

    const email = actor.email;
    const directMatch = await ctx.db
      .query("contributorProfiles")
      .withIndex("by_membership_email", (query) => query.eq("membershipEmail", email))
      .first();

    if (directMatch) {
      return await materializeProfile(ctx, directMatch as StoredProfile);
    }

    const derivedKey = deriveProfileKeyFromEmail(email);
    if (!derivedKey) {
      return null;
    }

    const fallbackMatch = await getStoredByKey(ctx, derivedKey);
    if (!fallbackMatch) {
      return null;
    }

    const membershipEmail = fallbackMatch.membershipEmail
      ? normalizeEmail(fallbackMatch.membershipEmail)
      : undefined;

    if (membershipEmail && membershipEmail !== email) {
      return null;
    }

    return await materializeProfile(ctx, fallbackMatch as StoredProfile);
  },
});

export const generateAvatarUploadUrl = mutation({
  args: {
    apiKey: v.optional(v.string()),
    actorEmail: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAuthenticatedWrite(ctx, {
      apiKey: args.apiKey,
      actorEmail: args.actorEmail,
      adminIntent: "profileMediaWrite",
    });
    return await ctx.storage.generateUploadUrl();
  },
});

export const saveProfile = mutation({
  args: {
    apiKey: v.optional(v.string()),
    actorEmail: v.string(),
    profile: profileInputValidator,
  },
  // Canonical public profile save owner: aliases, avatar metadata, ownership,
  // and contributor revalidation all stay in this module.
  handler: async (ctx, args) => {
    const actor = await requireAuthenticatedWrite(ctx, {
      apiKey: args.apiKey,
      adminIntent: "profileMediaWrite",
      actorEmail: args.actorEmail,
    });

    const actorEmail = actor.email;
    const actorRole = actor.role;
    const targetKey = resolveOwnedProfileKey(args.profile.key, actorEmail);

    if (!targetKey) {
      throw new Error("Profile key is required.");
    }

    const existing = await getStoredByKey(ctx, targetKey);
    const existingProfile = existing as StoredProfile | null;

    if (
      !canEditContributorProfile({
        actorEmail,
        actorRole,
        targetKey,
        existingProfile,
      })
    ) {
      throw new Error("You can only edit your own contributor profile.");
    }

    const nextProfile = buildStoredProfile(args.profile, existingProfile, actorEmail, actorRole);
    const aliases = attributionAliasesForProfile(existingProfile, nextProfile.aliases);

    if (existing) {
      await ctx.db.patch(existing._id, {
        ...nextProfile,
        aliases,
      });
      const updated = await getStoredByKey(ctx, targetKey);
      return {
        updated: true,
        profile: updated ? await materializeProfile(ctx, updated as StoredProfile) : null,
        revalidate: {
          contributorKeys: contributorProfileRevalidationKeys(targetKey, updated?.aliases),
          reportSlugs: [] as string[],
        },
      };
    }

    const createdAt = new Date().toISOString();
    await ctx.db.insert("contributorProfiles", {
      ...nextProfile,
      aliases,
      createdAt,
    });

    const created = await getStoredByKey(ctx, targetKey);
    return {
      updated: false,
      profile: created ? await materializeProfile(ctx, created as StoredProfile) : null,
      revalidate: {
        contributorKeys: contributorProfileRevalidationKeys(targetKey, created?.aliases),
        reportSlugs: [] as string[],
      },
    };
  },
});

export const bulkImport = mutation({
  args: {
    apiKey: v.optional(v.string()),
    profiles: v.array(bulkImportProfileValidator),
  },
  handler: async (ctx, args) => {
    await requireEditorWrite(ctx, {
      apiKey: args.apiKey,
      adminIntent: "profileMediaWrite",
    });

    let created = 0;
    let updated = 0;

    for (const entry of args.profiles) {
      const data = buildImportedStoredProfile(entry);
      if (!data) {
        continue;
      }

      const existing = await getStoredByKey(ctx, data.key);

      if (existing) {
        await ctx.db.patch(existing._id, {
          key: data.key,
          displayName: data.displayName,
          aliases: data.aliases,
          avatarStorageId: data.avatarStorageId,
          avatarUrl: data.avatarUrl,
          bio: data.bio,
          // bulkImport patches every field it is given, so a row that omits the
          // role clears it. Callers merge against the live row first.
          role: data.role,
          links: data.links,
          membershipEmail: data.membershipEmail,
          updatedAt: data.updatedAt,
          updatedBy: data.updatedBy,
        });
        updated += 1;
        continue;
      }

      await ctx.db.insert("contributorProfiles", data);
      created += 1;
    }

    return { created, updated };
  },
});

export const renameKey = mutation({
  args: {
    apiKey: v.optional(v.string()),
    fromKey: v.string(),
    toKey: v.string(),
    aliasesToAdd: v.optional(v.array(v.string())),
  },
  // Canonical public profile rename owner: profile key moves and trip report
  // subject profile keys are retargeted together.
  handler: async (ctx, args) => {
    await requireEditorWrite(ctx, {
      apiKey: args.apiKey,
      adminIntent: "profileMediaWrite",
    });

    const rename = buildRenamedProfilePatch({
      existingAliases: undefined,
      fromKey: args.fromKey,
      toKey: args.toKey,
      aliasesToAdd: args.aliasesToAdd,
    });

    const existing = await getStoredByKey(ctx, rename.fromKey);
    if (!existing) {
      throw new Error(`Profile "${rename.fromKey}" not found.`);
    }

    const conflicting = await getStoredByKey(ctx, rename.toKey);
    if (conflicting) {
      throw new Error(`Profile "${rename.toKey}" already exists.`);
    }

    const finalizedRename = buildRenamedProfilePatch({
      existingAliases: attributionAliasesForProfile(existing as StoredProfile, args.aliasesToAdd),
      fromKey: rename.fromKey,
      toKey: rename.toKey,
      aliasesToAdd: args.aliasesToAdd,
    });

    await ctx.db.patch(existing._id, finalizedRename.patch);
    const reportsUpdated = await patchReportsForContributorKey(ctx, [rename.fromKey], rename.toKey);

    const updated = await getStoredByKey(ctx, rename.toKey);
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

/**
 * Delete a contributor profile outright.
 *
 * Distinct from `mergeProfileInto`, which folds one identity into another and
 * keeps its names reachable as aliases. That is the wrong tool when a profile
 * should stop existing rather than be re-pointed: merging would preserve exactly
 * the name the deletion is meant to remove.
 *
 * Refuses while anything still credits the profile by key, because a trip report
 * carrying a dangling `profile_key` renders a link to a page that no longer
 * exists. Free-text credits elsewhere are the caller's problem to clear first —
 * this mutation removes the profile, not every mention of the person.
 */
export const deleteProfile = mutation({
  args: {
    apiKey: v.optional(v.string()),
    key: v.string(),
    /** Acknowledges that the bio, avatar and links are being destroyed. */
    confirmDelete: v.boolean(),
  },
  handler: async (ctx, args) => {
    await requireEditorWrite(ctx, {
      apiKey: args.apiKey,
      adminIntent: "profileMediaWrite",
    });

    if (!args.confirmDelete) {
      throw new Error("deleteProfile requires confirmDelete: there is no undo.");
    }

    const key = normalizeProfileKey(args.key);
    const existing = await getStoredByKey(ctx, key);
    if (!existing) {
      throw new Error(`Profile "${key}" not found.`);
    }

    const reports = await ctx.db.query("tripReports").collect();
    const stillReferenced = reports.filter(
      (report) => normalizeProfileKey(report.subject.profile_key ?? "") === key,
    );
    if (stillReferenced.length > 0) {
      throw new Error(
        `Profile "${key}" is still the recorded author of ${stillReferenced.length} report(s). ` +
          `Reassign or clear them first, or they will link to a page that does not exist.`,
      );
    }

    const profile = existing as StoredProfile;
    await ctx.db.delete(existing._id);

    return {
      deleted: true,
      key,
      displayName: profile.displayName,
      aliasesRemoved: profile.aliases ?? [],
    };
  },
});

/**
 * Fold one profile into another, for two rows that turned out to be the same person.
 *
 * `renameKey` cannot do this: it refuses when the destination already exists,
 * which is exactly the case here. Seeding credited names deliberately errs
 * toward giving an unconfirmed identity its own row, because an alias applied on
 * a hunch credits one person's work to another and is far harder to notice than
 * a duplicate. That choice is only safe if there is a way back, and this is it.
 *
 * The source row must go, not merely be emptied. Leaving it behind would give
 * two profiles the same matchable name, and `findContributorProfileByAuthorName`
 * returns the first match in array order — so which profile owned the byline
 * would depend on document order rather than on anything meaningful.
 *
 * Content is never silently discarded: a source carrying a bio, an avatar or
 * links is refused unless the caller says explicitly what should happen to it.
 */
export const mergeProfileInto = mutation({
  args: {
    apiKey: v.optional(v.string()),
    fromKey: v.string(),
    toKey: v.string(),
    /** Acknowledges that the source's bio, avatar and links are being dropped. */
    discardSourceContent: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireEditorWrite(ctx, {
      apiKey: args.apiKey,
      adminIntent: "profileMediaWrite",
    });

    const fromKey = normalizeProfileKey(args.fromKey);
    const toKey = normalizeProfileKey(args.toKey);

    if (!fromKey || !toKey) {
      throw new Error("Both fromKey and toKey are required.");
    }
    if (fromKey === toKey) {
      throw new Error("A profile cannot be merged into itself.");
    }

    const sourceDoc = await getStoredByKey(ctx, fromKey);
    const targetDoc = await getStoredByKey(ctx, toKey);

    if (!sourceDoc) throw new Error(`Profile "${fromKey}" not found.`);
    if (!targetDoc) throw new Error(`Profile "${toKey}" not found.`);

    const source = sourceDoc as StoredProfile;
    const target = targetDoc as StoredProfile;

    const carriedContent = [
      source.bio?.trim() ? "bio" : "",
      source.avatarStorageId || source.avatarUrl ? "avatar" : "",
      source.links?.length ? "links" : "",
    ].filter(Boolean);

    if (carriedContent.length > 0 && !args.discardSourceContent) {
      throw new Error(
        `Profile "${fromKey}" carries ${carriedContent.join(", ")} that this merge would discard. ` +
          `Move it onto "${toKey}" first, or pass discardSourceContent to confirm.`,
      );
    }

    // Everything the source answered to has to keep resolving, now against the
    // target — its display name, its aliases, and its key as a lowercase alias.
    const mergedAliases = attributionAliasesForProfile(target, [
      ...(source.aliases ?? []),
      source.displayName,
      fromKey.toLowerCase(),
    ]);

    await ctx.db.patch(targetDoc._id, {
      aliases: mergedAliases,
      updatedAt: new Date().toISOString(),
    });

    const reportsUpdated = await patchReportsForContributorKey(
      ctx,
      [source.displayName, ...(source.aliases ?? []), fromKey],
      toKey,
    );

    await ctx.db.delete(sourceDoc._id);

    return {
      mergedFrom: fromKey,
      mergedInto: toKey,
      aliases: mergedAliases,
      reportsUpdated,
      revalidate: {
        contributorKeys: [fromKey, toKey],
        reportSlugs: [] as string[],
      },
    };
  },
});

export const retargetTripReportsToContributor = mutation({
  args: {
    apiKey: v.optional(v.string()),
    actorEmail: v.string(),
    authorName: v.string(),
    contributorKey: v.string(),
    embeddedAuthorName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const actor = await requireAuthenticatedWrite(ctx, {
      apiKey: args.apiKey,
      adminIntent: "profileMediaWrite",
      actorEmail: args.actorEmail,
    });

    const actorEmail = actor.email;
    const targetKey = normalizeProfileKey(args.contributorKey);
    const existing = await getStoredByKey(ctx, targetKey);
    const existingProfile = existing as StoredProfile | null;

    if (!existingProfile) {
      throw new Error(`Profile "${targetKey}" not found.`);
    }

    if (
      !canEditContributorProfile({
        actorEmail,
        actorRole: actor.role,
        targetKey,
        existingProfile,
      })
    ) {
      throw new Error("You can only edit your own contributor profile.");
    }

    const reportsUpdated = await patchReportsForContributorKey(
      ctx,
      [args.authorName],
      targetKey,
      args.embeddedAuthorName,
    );

    await ctx.db.patch(existing._id, {
      aliases: attributionAliasesForProfile(existingProfile, [args.authorName]),
      updatedAt: new Date().toISOString(),
      updatedBy: actorEmail,
    });

    return {
      reportsUpdated,
      revalidate: {
        contributorKeys: [targetKey, args.authorName],
        reportSlugs: [] as string[],
      },
    };
  },
});

/**
 * Resolve which of the requested slugs actually exist in a slug-indexed table.
 *
 * Looks each slug up through `by_slug` rather than collecting the table: an
 * ordering is a short curated list, and `tripReports` is far too large to read
 * whole just to answer an existence question.
 */
async function existingSlugsIn(
  ctx: MutationCtx,
  table: "replications" | "tripReports",
  requested: readonly string[],
): Promise<Set<string>> {
  const found = new Set<string>();

  for (const slug of requested) {
    const row = await ctx.db
      .query(table)
      .withIndex("by_slug", (query) => query.eq("slug", slug))
      .first();

    if (row) {
      found.add(slug);
    }
  }

  return found;
}

/**
 * Editor edit of any contributor profile, addressed by key.
 *
 * Distinct from `saveProfile`, which is the self-serve path: that one resolves
 * the target from the caller's own email and refuses anything else. This one is
 * editor-gated and takes the key directly, for curating profiles whose owner
 * never signs in.
 *
 * Patch-only. An omitted field keeps whatever is stored, and `null` is the only
 * way to clear a clearable one. Deliberately NOT routed through `bulkImport`,
 * which writes every field it names and so erases anything the caller omits.
 */
export const saveProfileAsEditor = mutation({
  args: {
    apiKey: v.optional(v.string()),
    actorEmail: v.optional(v.string()),
    key: v.string(),
    patch: editorProfilePatchValidator,
  },
  handler: async (ctx, args) => {
    const actor = await requireEditorWrite(ctx, {
      apiKey: args.apiKey,
      actorEmail: args.actorEmail,
      adminIntent: "profileMediaWrite",
    });

    const key = normalizeProfileKey(args.key);
    if (!key) {
      throw new Error("Profile key is required.");
    }

    const existing = await getStoredByKey(ctx, key);
    if (!existing) {
      throw new Error(`Profile "${key}" not found.`);
    }

    const patch = buildEditorProfilePatch(args.patch, existing as StoredProfile, actor.email);
    await ctx.db.patch(existing._id, patch);

    const updated = await getStoredByKey(ctx, key);

    return {
      updated: true,
      profile: updated ? await materializeProfile(ctx, updated as StoredProfile) : null,
      revalidate: {
        contributorKeys: contributorProfileRevalidationKeys(key, updated?.aliases),
        reportSlugs: [] as string[],
      },
    };
  },
});

/**
 * Set a contributor's curated replication and/or report ordering.
 *
 * Partial curation: the stored slugs render first, in exactly this order, and
 * everything unlisted follows in the surface's existing default sort. Slugs
 * that do not resolve to a row are pruned here rather than stored, so a deleted
 * replication cannot survive as a phantom position, and they are returned so a
 * caller can say what it dropped.
 *
 * An omitted ordering is left alone; passing an empty array is how curation is
 * removed and the default sort restored.
 */
export const setContributorOrdering = mutation({
  args: {
    apiKey: v.optional(v.string()),
    actorEmail: v.optional(v.string()),
    key: v.string(),
    replicationOrder: v.optional(v.array(v.string())),
    reportOrder: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const actor = await requireEditorWrite(ctx, {
      apiKey: args.apiKey,
      actorEmail: args.actorEmail,
      adminIntent: "profileMediaWrite",
    });

    const key = normalizeProfileKey(args.key);
    if (!key) {
      throw new Error("Profile key is required.");
    }

    const existing = await getStoredByKey(ctx, key);
    if (!existing) {
      throw new Error(`Profile "${key}" not found.`);
    }

    const patch: Record<string, unknown> = {
      updatedAt: new Date().toISOString(),
      updatedBy: actor.email,
    };

    let prunedReplicationSlugs: string[] = [];
    let prunedReportSlugs: string[] = [];

    if (args.replicationOrder !== undefined) {
      const requested = normalizeOrderSlugs(args.replicationOrder);
      const known = await existingSlugsIn(ctx, "replications", requested);
      const result = pruneOrderSlugs(requested, known);
      patch.replicationOrder = result.order;
      prunedReplicationSlugs = result.pruned;
    }

    if (args.reportOrder !== undefined) {
      const requested = normalizeOrderSlugs(args.reportOrder);
      const known = await existingSlugsIn(ctx, "tripReports", requested);
      const result = pruneOrderSlugs(requested, known);
      patch.reportOrder = result.order;
      prunedReportSlugs = result.pruned;
    }

    await ctx.db.patch(existing._id, patch);

    const updated = (await getStoredByKey(ctx, key)) as StoredProfile | null;

    return {
      key,
      replicationOrder: normalizeOrderSlugs(updated?.replicationOrder),
      reportOrder: normalizeOrderSlugs(updated?.reportOrder),
      prunedReplicationSlugs,
      prunedReportSlugs,
      revalidate: {
        contributorKeys: contributorProfileRevalidationKeys(key, updated?.aliases),
        reportSlugs: [] as string[],
      },
    };
  },
});
