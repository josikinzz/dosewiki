import type { MutationCtx } from "../_generated/server";
import { requireAuthenticatedWrite, requireEditorWrite } from "./auth";
import {
  buildEditorProfilePatch,
  buildStoredProfile,
  canEditContributorProfile,
  materializeProfile,
  normalizeProfileKey,
  resolveOwnedProfileKey,
  type StoredProfile,
} from "./contributorProfiles";
import {
  attributionAliasesForProfile,
  contributorProfileRevalidationKeys,
  getStoredContributorProfile,
  patchReportsForContributorKey,
} from "./contributorProfilePersistence";

export async function generateContributorAvatarUploadUrlHandler(
  ctx: MutationCtx,
  args: { apiKey?: string; actorEmail?: string },
) {
  await requireAuthenticatedWrite(ctx, {
    apiKey: args.apiKey,
    actorEmail: args.actorEmail,
    adminIntent: "profileMediaWrite",
  });
  return await ctx.storage.generateUploadUrl();
}

export async function saveContributorProfileHandler(
  ctx: MutationCtx,
  args: {
    apiKey?: string;
    actorEmail: string;
    profile: Parameters<typeof buildStoredProfile>[0];
  },
) {
  const actor = await requireAuthenticatedWrite(ctx, {
    apiKey: args.apiKey,
    adminIntent: "profileMediaWrite",
    actorEmail: args.actorEmail,
  });
  const targetKey = resolveOwnedProfileKey(args.profile.key, actor.email);
  if (!targetKey) throw new Error("Profile key is required.");

  const existing = await getStoredContributorProfile(ctx, targetKey);
  const existingProfile = existing as StoredProfile | null;
  if (
    !canEditContributorProfile({
      actorEmail: actor.email,
      actorRole: actor.role,
      targetKey,
      existingProfile,
    })
  ) {
    throw new Error("You can only edit your own contributor profile.");
  }

  const nextProfile = buildStoredProfile(
    args.profile,
    existingProfile,
    actor.email,
    actor.role,
  );
  const aliases = attributionAliasesForProfile(existingProfile, nextProfile.aliases);
  if (existing) {
    await ctx.db.patch(existing._id, { ...nextProfile, aliases });
    const updated = await getStoredContributorProfile(ctx, targetKey);
    return {
      updated: true,
      profile: updated ? await materializeProfile(ctx, updated as StoredProfile) : null,
      revalidate: {
        contributorKeys: contributorProfileRevalidationKeys(targetKey, updated?.aliases),
        reportSlugs: [] as string[],
      },
    };
  }

  await ctx.db.insert("contributorProfiles", {
    ...nextProfile,
    aliases,
    createdAt: new Date().toISOString(),
  });
  const created = await getStoredContributorProfile(ctx, targetKey);
  return {
    updated: false,
    profile: created ? await materializeProfile(ctx, created as StoredProfile) : null,
    revalidate: {
      contributorKeys: contributorProfileRevalidationKeys(targetKey, created?.aliases),
      reportSlugs: [] as string[],
    },
  };
}


export async function deleteContributorProfileHandler(
  ctx: MutationCtx,
  args: { apiKey?: string; key: string; confirmDelete: boolean },
) {
  await requireEditorWrite(ctx, {
    apiKey: args.apiKey,
    adminIntent: "profileMediaWrite",
  });
  if (!args.confirmDelete) {
    throw new Error("deleteProfile requires confirmDelete: there is no undo.");
  }
  const key = normalizeProfileKey(args.key);
  const existing = await getStoredContributorProfile(ctx, key);
  if (!existing) throw new Error(`Profile "${key}" not found.`);
  const reports = await ctx.db.query("tripReports").collect();
  const stillReferenced = reports.filter(
    (report) => normalizeProfileKey(report.subject.profile_key ?? "") === key,
  );
  if (stillReferenced.length > 0) {
    throw new Error(
      `Profile "${key}" is still the recorded author of ${stillReferenced.length} report(s). ` +
        "Reassign or clear them first, or they will link to a page that does not exist.",
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
}

export async function mergeContributorProfileHandler(
  ctx: MutationCtx,
  args: { apiKey?: string; fromKey: string; toKey: string; discardSourceContent?: boolean },
) {
  await requireEditorWrite(ctx, {
    apiKey: args.apiKey,
    adminIntent: "profileMediaWrite",
  });
  const fromKey = normalizeProfileKey(args.fromKey);
  const toKey = normalizeProfileKey(args.toKey);
  if (!fromKey || !toKey) throw new Error("Both fromKey and toKey are required.");
  if (fromKey === toKey) throw new Error("A profile cannot be merged into itself.");
  const sourceDoc = await getStoredContributorProfile(ctx, fromKey);
  const targetDoc = await getStoredContributorProfile(ctx, toKey);
  if (!sourceDoc) throw new Error(`Profile "${fromKey}" not found.`);
  if (!targetDoc) throw new Error(`Profile "${toKey}" not found.`);
  const source = sourceDoc as StoredProfile;
  const target = targetDoc as StoredProfile;
  const carriedContent = [
    source.bio?.trim() ? "bio" : "",
    source.avatarStorageId || source.avatarR2Key || source.avatarUrl ? "avatar" : "",
    source.links?.length ? "links" : "",
  ].filter(Boolean);
  if (carriedContent.length > 0 && !args.discardSourceContent) {
    throw new Error(
      `Profile "${fromKey}" carries ${carriedContent.join(", ")} that this merge would discard. ` +
        `Move it onto "${toKey}" first, or pass discardSourceContent to confirm.`,
    );
  }
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
}

export async function retargetTripReportsToContributorHandler(
  ctx: MutationCtx,
  args: {
    apiKey?: string;
    actorEmail: string;
    authorName: string;
    contributorKey: string;
    embeddedAuthorName?: string;
  },
) {
  const actor = await requireAuthenticatedWrite(ctx, {
    apiKey: args.apiKey,
    adminIntent: "profileMediaWrite",
    actorEmail: args.actorEmail,
  });
  const targetKey = normalizeProfileKey(args.contributorKey);
  const existing = await getStoredContributorProfile(ctx, targetKey);
  const existingProfile = existing as StoredProfile | null;
  if (!existingProfile) throw new Error(`Profile "${targetKey}" not found.`);
  if (
    !canEditContributorProfile({
      actorEmail: actor.email,
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
    updatedBy: actor.email,
  });
  return {
    reportsUpdated,
    revalidate: {
      contributorKeys: [targetKey, args.authorName],
      reportSlugs: [] as string[],
    },
  };
}

export async function saveContributorProfileAsEditorHandler(
  ctx: MutationCtx,
  args: {
    apiKey?: string;
    actorEmail?: string;
    key: string;
    patch: Parameters<typeof buildEditorProfilePatch>[0];
  },
) {
  const actor = await requireEditorWrite(ctx, {
    apiKey: args.apiKey,
    actorEmail: args.actorEmail,
    adminIntent: "profileMediaWrite",
  });
  const key = normalizeProfileKey(args.key);
  if (!key) throw new Error("Profile key is required.");
  const existing = await getStoredContributorProfile(ctx, key);
  if (!existing) throw new Error(`Profile "${key}" not found.`);
  const patch = buildEditorProfilePatch(args.patch, existing as StoredProfile, actor.email);
  await ctx.db.patch(existing._id, patch);
  const updated = await getStoredContributorProfile(ctx, key);
  return {
    updated: true,
    profile: updated ? await materializeProfile(ctx, updated as StoredProfile) : null,
    revalidate: {
      contributorKeys: contributorProfileRevalidationKeys(key, updated?.aliases),
      reportSlugs: [] as string[],
    },
  };
}
