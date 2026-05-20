import { v } from "convex/values";
import { mutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { requireAuthenticatedWrite, requireEditorWrite } from "./lib/auth";
import {
  buildRenamedProfilePatch,
  buildStoredProfile,
  canEditContributorProfile,
  materializeProfile,
  normalizeProfileKey,
  profileInputValidator,
  resolveOwnedProfileKey,
  sanitizeAliases,
  type StoredProfile,
} from "./lib/contributorProfiles";

async function getStoredProfileByKey(ctx: MutationCtx, key: string) {
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

export const saveContributorProfile = mutation({
  args: {
    apiKey: v.optional(v.string()),
    actorEmail: v.string(),
    profile: profileInputValidator,
  },
  handler: async (ctx, args) => {
    const actor = await requireAuthenticatedWrite(ctx, {
      apiKey: args.apiKey,
      adminIntent: "profileMediaWrite",
      actorEmail: args.actorEmail,
    });

    const actorEmail = actor.email;
    const targetKey = resolveOwnedProfileKey(args.profile.key, actorEmail);
    if (!targetKey) {
      throw new Error("Profile key is required.");
    }

    const existing = await getStoredProfileByKey(ctx, targetKey);
    const existingProfile = existing as StoredProfile | null;

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

    const nextProfile = buildStoredProfile(args.profile, existingProfile, actorEmail, actor.role);
    const aliases = attributionAliasesForProfile(existingProfile, nextProfile.aliases);

    if (existing) {
      await ctx.db.patch(existing._id, {
        ...nextProfile,
        aliases,
      });
    } else {
      await ctx.db.insert("contributorProfiles", {
        ...nextProfile,
        aliases,
        createdAt: new Date().toISOString(),
      });
    }

    const updated = await getStoredProfileByKey(ctx, targetKey);
    return {
      updated: Boolean(existing),
      profile: updated ? await materializeProfile(ctx, updated as StoredProfile) : null,
      revalidate: {
        contributorKeys: sanitizeAliases([targetKey, ...(updated?.aliases ?? [])]).map((key) => normalizeProfileKey(key)),
        reportSlugs: [] as string[],
      },
    };
  },
});

export const renamePublicProfileKey = mutation({
  args: {
    apiKey: v.optional(v.string()),
    fromKey: v.string(),
    toKey: v.string(),
    aliasesToAdd: v.optional(v.array(v.string())),
  },
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
    const existing = await getStoredProfileByKey(ctx, rename.fromKey);
    if (!existing) {
      throw new Error(`Profile "${rename.fromKey}" not found.`);
    }

    const conflicting = await getStoredProfileByKey(ctx, rename.toKey);
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
    const updated = await getStoredProfileByKey(ctx, rename.toKey);

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
    const existing = await getStoredProfileByKey(ctx, targetKey);
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

    const reportsUpdated = await patchReportsForContributorKey(ctx, [args.authorName], targetKey, args.embeddedAuthorName);

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
