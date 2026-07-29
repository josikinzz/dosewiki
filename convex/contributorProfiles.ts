import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { requireAuthenticatedWrite, requireEditorWrite } from "./lib/auth";
import {
  buildImportedStoredProfile,
  buildRenamedProfilePatch,
  buildStoredProfile,
  bulkImportProfileValidator,
  canEditContributorProfile,
  deriveProfileKeyFromEmail,
  materializeProfile,
  normalizeEmail,
  normalizeProfileKey,
  profileInputValidator,
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
