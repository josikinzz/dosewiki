import { ConvexError } from "convex/values";
import type { MutationCtx } from "../_generated/server";
import { requireRole, roleMeetsFloor } from "./auth";
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

/**
 * Trust settings on a profile: who the record belongs to, how it is
 * presented to readers, and staff commentary. An editor may polish a
 * profile's copy, but changing these is an admin decision.
 */
export const ADMIN_ONLY_PROFILE_PATCH_FIELDS = [
  "role",
  "membershipEmail",
  "approved_replicator",
  "exclude_from_gallery",
  "archival",
  "staffNote",
] as const;

export function assertEditorProfilePatchAllowed(
  patch: Record<string, unknown>,
  actorRole: Parameters<typeof roleMeetsFloor>[0],
): void {
  if (roleMeetsFloor(actorRole, "admin")) return;
  for (const field of ADMIN_ONLY_PROFILE_PATCH_FIELDS) {
    if (field in patch && patch[field] !== undefined) {
      throw new ConvexError({
        code: "ADMIN_ONLY_PROFILE_FIELD",
        field,
        message: `Only an admin can change "${field}" on a contributor profile.`,
      });
    }
  }
}

export async function generateContributorAvatarUploadUrlHandler(
  ctx: MutationCtx,
  args: { apiKey?: string; actorEmail?: string },
) {
  await requireRole(
    ctx,
    { apiKey: args.apiKey, actorEmail: args.actorEmail, adminIntent: "profileMediaWrite" },
    "contributor",
  );
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
  const actor = await requireRole(
    ctx,
    { apiKey: args.apiKey, actorEmail: args.actorEmail, adminIntent: "profileMediaWrite" },
    "contributor",
  );
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
  args: { apiKey?: string; actorEmail?: string; key: string; confirmDelete: boolean },
) {
  await requireRole(
    ctx,
    { apiKey: args.apiKey, actorEmail: args.actorEmail, adminIntent: "profileMediaWrite" },
    "admin",
  );
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
  args: {
    apiKey?: string;
    actorEmail?: string;
    fromKey: string;
    toKey: string;
    discardSourceContent?: boolean;
  },
) {
  await requireRole(
    ctx,
    { apiKey: args.apiKey, actorEmail: args.actorEmail, adminIntent: "profileMediaWrite" },
    "admin",
  );
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
  const actor = await requireRole(
    ctx,
    { apiKey: args.apiKey, actorEmail: args.actorEmail, adminIntent: "profileMediaWrite" },
    "contributor",
  );
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
  const actor = await requireRole(
    ctx,
    { apiKey: args.apiKey, actorEmail: args.actorEmail, adminIntent: "profileMediaWrite" },
    "editor",
  );
  assertEditorProfilePatchAllowed(args.patch, actor.role);
  const key = normalizeProfileKey(args.key);
  if (!key) throw new Error("Profile key is required.");
  const existing = await getStoredContributorProfile(ctx, key);
  if (!existing) throw new Error(`Profile "${key}" not found.`);
  if (
    !canEditContributorProfile({
      actorEmail: actor.email,
      actorRole: actor.role,
      targetKey: key,
      existingProfile: existing as StoredProfile,
    })
  ) {
    throw new Error("You can only edit your own contributor profile.");
  }
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
