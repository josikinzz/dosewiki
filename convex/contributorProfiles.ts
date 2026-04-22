import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { requireAuth } from "./lib/auth";
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
  roleValidator,
  type StoredProfile,
} from "./lib/contributorProfiles";

async function getStoredByKey(ctx: QueryCtx | MutationCtx, key: string) {
  return await ctx.db
    .query("contributorProfiles")
    .withIndex("by_key", (query) => query.eq("key", normalizeProfileKey(key)))
    .first();
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

export const getOwnedProfile = query({
  args: {
    apiKey: v.optional(v.string()),
    email: v.string(),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx, args.apiKey);

    const email = normalizeEmail(args.email);
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
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx, args.apiKey);
    return await ctx.storage.generateUploadUrl();
  },
});

export const saveProfile = mutation({
  args: {
    apiKey: v.optional(v.string()),
    actorEmail: v.string(),
    actorRole: v.optional(roleValidator),
    profile: profileInputValidator,
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx, args.apiKey);

    const actorEmail = normalizeEmail(args.actorEmail);
    const actorRole = args.actorRole;
    const targetKey = normalizeProfileKey(args.profile.key);

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

    if (existing) {
      await ctx.db.patch(existing._id, nextProfile);
      const updated = await getStoredByKey(ctx, targetKey);
      return {
        updated: true,
        profile: updated ? await materializeProfile(ctx, updated as StoredProfile) : null,
      };
    }

    const createdAt = new Date().toISOString();
    await ctx.db.insert("contributorProfiles", {
      ...nextProfile,
      createdAt,
    });

    const created = await getStoredByKey(ctx, targetKey);
    return {
      updated: false,
      profile: created ? await materializeProfile(ctx, created as StoredProfile) : null,
    };
  },
});

export const bulkImport = mutation({
  args: {
    apiKey: v.optional(v.string()),
    profiles: v.array(bulkImportProfileValidator),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx, args.apiKey);

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
  handler: async (ctx, args) => {
    await requireAuth(ctx, args.apiKey);

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
      existingAliases: existing.aliases,
      fromKey: rename.fromKey,
      toKey: rename.toKey,
      aliasesToAdd: args.aliasesToAdd,
    });

    await ctx.db.patch(existing._id, finalizedRename.patch);

    const updated = await getStoredByKey(ctx, rename.toKey);
    return updated ? await materializeProfile(ctx, updated as StoredProfile) : null;
  },
});
