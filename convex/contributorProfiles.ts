import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { requireAuth } from "./lib/auth";

const roleValidator = v.union(v.literal("admin"), v.literal("editor"), v.literal("viewer"));
const linkValidator = v.object({
  label: v.string(),
  url: v.string(),
});

const profileInputValidator = v.object({
  key: v.string(),
  displayName: v.string(),
  bio: v.string(),
  links: v.array(linkValidator),
  avatarUrl: v.optional(v.union(v.string(), v.null())),
  avatarStorageId: v.optional(v.string()),
});

const MAX_BIO_LENGTH = 4000;
const MAX_DISPLAY_NAME_LENGTH = 120;
const MAX_LINKS = 3;
const MAX_LINK_LABEL_LENGTH = 60;
const HTTPS_PROTOCOL = "https:";
const AVATAR_PUBLIC_BASE_PATH = "/profile-avatars/";

type StoredProfile = {
  key: string;
  displayName: string;
  aliases: string[];
  avatarStorageId?: string;
  avatarUrl?: string;
  bio: string;
  links: Array<{ label: string; url: string }>;
  membershipEmail?: string;
  createdAt: string;
  updatedAt: string;
  updatedBy?: string;
};

type PublicProfile = {
  key: string;
  displayName: string;
  aliases: string[];
  avatarUrl: string | null;
  bio: string;
  links: Array<{ label: string; url: string }>;
  hasCustomBio: boolean;
};

function normalizeProfileKey(value: string): string {
  return value.trim().toUpperCase();
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function deriveProfileKeyFromEmail(email: string): string {
  const localPart = email.split("@")[0]?.trim() ?? "";
  const normalizedKey = localPart.replace(/[^a-z0-9-]/gi, "").toUpperCase();
  return normalizedKey || email.toUpperCase();
}

function toDisplayName(key: string, fallback = "Contributor"): string {
  return (
    key
      .split(/[_\-\s]+/)
      .filter((segment) => segment.length > 0)
      .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1).toLowerCase())
      .join(" ") || fallback
  );
}

function sanitizeDisplayName(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  return trimmed.length > MAX_DISPLAY_NAME_LENGTH
    ? trimmed.slice(0, MAX_DISPLAY_NAME_LENGTH)
    : trimmed;
}

function sanitizeBio(value: string): string {
  const normalized = value.replace(/\r\n/g, "\n");
  return normalized.length > MAX_BIO_LENGTH ? normalized.slice(0, MAX_BIO_LENGTH) : normalized;
}

function sanitizeAvatarUrl(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  if (trimmed.startsWith(AVATAR_PUBLIC_BASE_PATH)) {
    const [pathPart] = trimmed.split("?");
    if (!pathPart || pathPart.includes("..")) {
      return null;
    }
    return trimmed;
  }

  try {
    const url = new URL(trimmed);
    return url.protocol === HTTPS_PROTOCOL ? url.toString() : null;
  } catch {
    return null;
  }
}

function sanitizeAliases(value: string[] | undefined): string[] {
  return (value ?? [])
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0);
}

function sanitizeLinks(links: Array<{ label: string; url: string }>): Array<{ label: string; url: string }> {
  const normalized: Array<{ label: string; url: string }> = [];

  for (const link of links) {
    if (normalized.length >= MAX_LINKS) {
      break;
    }

    const label = typeof link.label === "string" ? link.label.trim() : "";
    const url = typeof link.url === "string" ? link.url.trim() : "";

    if (!label || !url) {
      continue;
    }

    const normalizedLabel =
      label.length > MAX_LINK_LABEL_LENGTH ? label.slice(0, MAX_LINK_LABEL_LENGTH) : label;

    try {
      const parsed = new URL(url);
      if (parsed.protocol !== HTTPS_PROTOCOL) {
        continue;
      }

      normalized.push({
        label: normalizedLabel,
        url: parsed.toString(),
      });
    } catch {
      continue;
    }
  }

  return normalized;
}

function buildStoredProfile(
  input: {
    key: string;
    displayName: string;
    bio: string;
    links: Array<{ label: string; url: string }>;
    avatarUrl?: string | null;
    avatarStorageId?: string;
  },
  existing: StoredProfile | null,
  actorEmail: string,
  actorRole: "admin" | "editor" | "viewer" | undefined,
): Omit<StoredProfile, "createdAt"> {
  const key = normalizeProfileKey(input.key);
  const displayName = sanitizeDisplayName(input.displayName) || toDisplayName(key);
  const bio = sanitizeBio(input.bio);
  const links = sanitizeLinks(input.links);

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
  const derivedKey = deriveProfileKeyFromEmail(actorEmail);
  const existingMembershipEmail = existing?.membershipEmail ? normalizeEmail(existing.membershipEmail) : undefined;
  const canClaimOwnership =
    key === derivedKey && (!existingMembershipEmail || existingMembershipEmail === actorEmail);
  const membershipEmail =
    actorRole === "admin" || actorRole === "editor"
      ? existingMembershipEmail
      : canClaimOwnership || existingMembershipEmail === actorEmail
        ? actorEmail
        : existingMembershipEmail;

  return {
    key,
    displayName,
    aliases: existing?.aliases ?? [],
    avatarStorageId,
    avatarUrl,
    bio,
    links,
    membershipEmail,
    updatedAt: now,
    updatedBy: actorEmail,
  };
}

async function materializeProfile(
  ctx: { storage: { getUrl: (storageId: string) => Promise<string | null> } },
  profile: StoredProfile,
): Promise<PublicProfile> {
  let resolvedAvatarUrl = sanitizeAvatarUrl(profile.avatarUrl);

  if (profile.avatarStorageId) {
    resolvedAvatarUrl = (await ctx.storage.getUrl(profile.avatarStorageId)) ?? resolvedAvatarUrl;
  }

  return {
    key: normalizeProfileKey(profile.key),
    displayName: sanitizeDisplayName(profile.displayName) || toDisplayName(profile.key),
    aliases: sanitizeAliases(profile.aliases),
    avatarUrl: resolvedAvatarUrl,
    bio: sanitizeBio(profile.bio),
    links: sanitizeLinks(profile.links ?? []),
    hasCustomBio: sanitizeBio(profile.bio).trim().length > 0,
  };
}

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
    const derivedKey = deriveProfileKeyFromEmail(actorEmail);
    const existingMembershipEmail = existingProfile?.membershipEmail
      ? normalizeEmail(existingProfile.membershipEmail)
      : undefined;
    const isEditor = actorRole === "admin" || actorRole === "editor";
    const ownsExisting = existingMembershipEmail === actorEmail;
    const canClaimByKey =
      targetKey === derivedKey && (!existingMembershipEmail || existingMembershipEmail === actorEmail);

    if (!isEditor && !ownsExisting && !canClaimByKey) {
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
    profiles: v.array(
      v.object({
        key: v.string(),
        displayName: v.string(),
        aliases: v.optional(v.array(v.string())),
        avatarStorageId: v.optional(v.string()),
        avatarUrl: v.optional(v.string()),
        bio: v.string(),
        links: v.array(linkValidator),
        membershipEmail: v.optional(v.string()),
        createdAt: v.optional(v.string()),
        updatedAt: v.optional(v.string()),
        updatedBy: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx, args.apiKey);

    let created = 0;
    let updated = 0;

    for (const entry of args.profiles) {
      const key = normalizeProfileKey(entry.key);
      if (!key) {
        continue;
      }

      const now = new Date().toISOString();
      const existing = await getStoredByKey(ctx, key);
      const data = {
        key,
        displayName: sanitizeDisplayName(entry.displayName) || toDisplayName(key),
        aliases: sanitizeAliases(entry.aliases),
        avatarStorageId: entry.avatarStorageId,
        avatarUrl: sanitizeAvatarUrl(entry.avatarUrl) ?? undefined,
        bio: sanitizeBio(entry.bio),
        links: sanitizeLinks(entry.links),
        membershipEmail: entry.membershipEmail ? normalizeEmail(entry.membershipEmail) : undefined,
        updatedAt: entry.updatedAt ?? now,
        updatedBy: entry.updatedBy ? normalizeEmail(entry.updatedBy) : "system@dosewiki.internal",
      };

      if (existing) {
        await ctx.db.patch(existing._id, data);
        updated += 1;
        continue;
      }

      await ctx.db.insert("contributorProfiles", {
        ...data,
        createdAt: entry.createdAt ?? now,
      });
      created += 1;
    }

    return { created, updated };
  },
});
