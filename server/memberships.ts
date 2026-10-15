import { query } from "../lib/postgres/runtime/server";
import { mutation } from "./lib/indexedMutation";
import { PostgresError, v } from "../lib/postgres/runtime/values";
import { requireRole } from "./lib/auth";

import { membershipRoleValidator as roleValidator } from "./lib/accessSchemaValidators";
import { parseGlossaryLocaleGrant } from "../src/lib/auth/roles";

const normalizeEmail = (email: string) => email.trim().toLowerCase();
const normalizeUsername = (username: string) => username.trim().toLowerCase();
const nextPasswordUpdatedAt = (previous?: string) =>
  new Date(Math.max(Date.now(), (Date.parse(previous ?? "") || 0) + 1)).toISOString();

export const getByEmail = query({
  args: {
    apiKey: v.string(),
    email: v.string(),
  },
  returns: v.union(
    v.null(),
    v.object({
      email: v.string(),
      username: v.optional(v.string()),
      role: roleValidator,
      glossaryLocales: v.optional(v.array(v.string())),
      name: v.optional(v.string()),
      image: v.optional(v.string()),
      bannedAt: v.optional(v.string()),
      passwordUpdatedAt: v.optional(v.string()),
    }),
  ),
  handler: async (ctx, args) => {
    await requireRole(ctx, { apiKey: args.apiKey }, "admin");

    const membership = await ctx.db
      .query("memberships")
      .withIndex("by_email", (query) => query.eq("email", normalizeEmail(args.email)))
      .unique();

    if (!membership) {
      return null;
    }

    return {
      email: membership.email,
      username: membership.username,
      role: membership.role,
      glossaryLocales: membership.glossaryLocales,
      name: membership.name,
      image: membership.image,
      bannedAt: membership.bannedAt,
      passwordUpdatedAt: membership.passwordUpdatedAt,
    };
  },
});

export const getCredentialsByUsername = query({
  args: {
    apiKey: v.string(),
    username: v.string(),
  },
  returns: v.union(
    v.null(),
    v.object({
      email: v.string(),
      role: roleValidator,
      name: v.optional(v.string()),
      passwordHash: v.optional(v.string()),
      bannedAt: v.optional(v.string()),
      passwordUpdatedAt: v.optional(v.string()),
    }),
  ),
  handler: async (ctx, args) => {
    await requireRole(ctx, { apiKey: args.apiKey }, "admin");

    const membership = await ctx.db
      .query("memberships")
      .withIndex("by_username", (query) => query.eq("username", normalizeUsername(args.username)))
      .unique();

    if (!membership) {
      return null;
    }

    return {
      email: membership.email,
      role: membership.role,
      name: membership.name,
      passwordHash: membership.passwordHash,
      bannedAt: membership.bannedAt,
      passwordUpdatedAt: membership.passwordUpdatedAt,
    };
  },
});

export const touchSignIn = mutation({
  args: {
    apiKey: v.string(),
    email: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireRole(ctx, { apiKey: args.apiKey }, "admin");

    const membership = await ctx.db
      .query("memberships")
      .withIndex("by_email", (query) => query.eq("email", normalizeEmail(args.email)))
      .unique();

    if (membership) {
      await ctx.db.patch(membership._id, { lastSeenAt: new Date().toISOString() });
    }

    return null;
  },
});

export const setAdminAccount = mutation({
  args: {
    apiKey: v.string(),
    username: v.string(),
    email: v.string(),
    name: v.string(),
    passwordHash: v.string(),
  },
  returns: v.object({
    membershipId: v.id("memberships"),
    created: v.boolean(),
  }),
  handler: async (ctx, args) => {
    await requireRole(ctx, { apiKey: args.apiKey }, "admin");

    const username = normalizeUsername(args.username);
    const email = normalizeEmail(args.email);
    const name = args.name.trim();
    if (!username || !email || !name || !args.passwordHash) {
      throw new Error("username, email, name, and passwordHash are required");
    }

    const now = new Date().toISOString();
    const byUsername = await ctx.db
      .query("memberships")
      .withIndex("by_username", (query) => query.eq("username", username))
      .unique();
    const byEmail = await ctx.db
      .query("memberships")
      .withIndex("by_email", (query) => query.eq("email", email))
      .unique();

    if (byUsername && byEmail && byUsername._id !== byEmail._id) {
      throw new Error(`username ${username} and email ${email} belong to different memberships`);
    }

    const existing = byUsername ?? byEmail;
    const fields = {
      email,
      username,
      name,
      role: "admin" as const,
      passwordHash: args.passwordHash,
      passwordUpdatedAt: nextPasswordUpdatedAt(existing?.passwordUpdatedAt),
      updatedAt: now,
    };

    if (existing) {
      await ctx.db.patch(existing._id, fields);
      return { membershipId: existing._id, created: false };
    }

    const membershipId = await ctx.db.insert("memberships", { ...fields, createdAt: now });
    return { membershipId, created: true };
  },
});

export const renameAccount = mutation({
  args: {
    apiKey: v.string(),
    fromUsername: v.string(),
    toUsername: v.string(),
    toEmail: v.string(),
    toName: v.string(),
  },
  returns: v.object({
    membershipId: v.id("memberships"),
    fromEmail: v.string(),
    removedPlaceholders: v.array(v.string()),
    movedDrafts: v.number(),
  }),
  handler: async (ctx, args) => {
    await requireRole(ctx, { apiKey: args.apiKey }, "admin");

    const fromUsername = normalizeUsername(args.fromUsername);
    const toUsername = normalizeUsername(args.toUsername);
    const toEmail = normalizeEmail(args.toEmail);
    const toName = args.toName.trim();
    if (!fromUsername || !toUsername || !toEmail.includes("@") || !toName) {
      throw new Error("fromUsername, toUsername, toEmail, and toName are required");
    }

    const source = await ctx.db
      .query("memberships")
      .withIndex("by_username", (query) => query.eq("username", fromUsername))
      .unique();
    if (!source) {
      throw new Error(`No account has the username ${fromUsername}.`);
    }
    if (source.bannedAt) {
      throw new Error(`${fromUsername} is banned; unban it before renaming.`);
    }

    const byUsername = await ctx.db
      .query("memberships")
      .withIndex("by_username", (query) => query.eq("username", toUsername))
      .unique();
    const byEmail = await ctx.db
      .query("memberships")
      .withIndex("by_email", (query) => query.eq("email", toEmail))
      .unique();
    const placeholders = [byUsername, byEmail].filter(
      (row, index, rows): row is NonNullable<typeof row> =>
        row !== null && row._id !== source._id && rows.findIndex((other) => other?._id === row._id) === index,
    );
    for (const row of placeholders) {
      if (row.lastSeenAt) {
        throw new Error(`${row.email} has signed in before; it is a live account, not a placeholder.`);
      }
    }
    for (const row of placeholders) {
      await ctx.db.delete(row._id);
    }

    const fromEmail = source.email;
    const now = new Date().toISOString();
    await ctx.db.patch(source._id, {
      username: toUsername,
      email: toEmail,
      name: toName,
      passwordUpdatedAt: nextPasswordUpdatedAt(source.passwordUpdatedAt),
      resetTokenHash: undefined,
      resetTokenExpiresAt: undefined,
      updatedAt: now,
    });

    let movedDrafts = 0;
    if (fromEmail !== toEmail) {
      const drafts = await ctx.db
        .query("articleDrafts")
        .withIndex("by_owner_slug", (query) => query.eq("ownerEmail", fromEmail))
        .collect();
      for (const draft of drafts) {
        await ctx.db.patch(draft._id, { ownerEmail: toEmail });
        movedDrafts += 1;
      }
    }

    return {
      membershipId: source._id,
      fromEmail,
      removedPlaceholders: placeholders.map((row) => row.email),
      movedDrafts,
    };
  },
});

export const retireViewerMemberships = mutation({
  args: {
    apiKey: v.string(),
  },
  returns: v.object({ deleted: v.number() }),
  handler: async (ctx, args) => {
    await requireRole(ctx, { apiKey: args.apiKey }, "admin");

    const viewers = await ctx.db
      .query("memberships")
      .withIndex("by_role", (query) => query.eq("role", "viewer"))
      .collect();

    let deleted = 0;
    for (const membership of viewers) {
      if (membership.username) {
        continue;
      }
      await ctx.db.delete(membership._id);
      deleted += 1;
    }

    return { deleted };
  },
});

const rosterRoleValidator = v.union(v.literal("editor"), v.literal("translator"), v.literal("editor_translator"), v.literal("contributor"));

const rosterRow = v.object({
  email: v.string(),
  username: v.optional(v.string()),
  name: v.optional(v.string()),
  role: roleValidator,
  glossaryLocales: v.optional(v.array(v.string())),
  lastSeenAt: v.optional(v.string()),
  bannedAt: v.optional(v.string()),
  invitedBy: v.optional(v.string()),
});

const rosterActorArgs = {
  apiKey: v.string(),
  actorEmail: v.string(),
};

export const listRoster = query({
  args: rosterActorArgs,
  returns: v.array(rosterRow),
  handler: async (ctx, args) => {
    await requireRole(ctx, args, "admin");

    const rows = await ctx.db.query("memberships").collect();
    return rows.map((row) => ({
      email: row.email,
      username: row.username,
      name: row.name,
      role: row.role,
      glossaryLocales: row.glossaryLocales,
      lastSeenAt: row.lastSeenAt,
      bannedAt: row.bannedAt,
      invitedBy: row.invitedBy,
    }));
  },
});

async function requireManagedTarget(
  ctx: Parameters<typeof requireRole>[0],
  args: { apiKey: string; actorEmail: string; email: string },
) {
  const actor = await requireRole(ctx, args, "admin");
  const email = normalizeEmail(args.email);
  if (email === actor.email) {
    throw new PostgresError({ code: "SELF_TARGET", message: "You cannot change your own membership." });
  }

  const membership = await ctx.db
    .query("memberships")
    .withIndex("by_email", (query) => query.eq("email", email))
    .unique();
  if (!membership) {
    throw new PostgresError({ code: "MEMBER_NOT_FOUND", message: `No membership for ${email}.` });
  }
  if (membership.role === "admin") {
    throw new PostgresError({
      code: "ADMIN_TARGET",
      message: "Admin accounts are managed from the seed script, not the roster.",
    });
  }

  return membership;
}

export const setRole = mutation({
  args: {
    ...rosterActorArgs,
    email: v.string(),
    role: rosterRoleValidator,
    glossaryLocales: v.optional(v.array(v.string())),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const membership = await requireManagedTarget(ctx, args);
    const glossaryLocales = parseGlossaryLocaleGrant(args.role, args.glossaryLocales);
    await ctx.db.patch(membership._id, { role: args.role, glossaryLocales, updatedAt: new Date().toISOString() });
    return null;
  },
});

export const ban = mutation({
  args: {
    ...rosterActorArgs,
    email: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const membership = await requireManagedTarget(ctx, args);
    const now = new Date().toISOString();
    await ctx.db.patch(membership._id, { bannedAt: now, updatedAt: now });
    return null;
  },
});

export const unban = mutation({
  args: {
    ...rosterActorArgs,
    email: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const membership = await requireManagedTarget(ctx, args);
    await ctx.db.patch(membership._id, { bannedAt: undefined, updatedAt: new Date().toISOString() });
    return null;
  },
});

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

export const issuePasswordReset = mutation({
  args: {
    ...rosterActorArgs,
    email: v.string(),
    tokenHash: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const membership = await requireManagedTarget(ctx, args);
    if (membership.bannedAt) {
      throw new PostgresError({
        code: "MEMBER_BANNED",
        message: `${membership.email} is banned; unban them before issuing a reset link.`,
      });
    }
    if (!args.tokenHash) {
      throw new Error("tokenHash is required");
    }
    const now = Date.now();
    await ctx.db.patch(membership._id, {
      resetTokenHash: args.tokenHash,
      resetTokenExpiresAt: new Date(now + RESET_TOKEN_TTL_MS).toISOString(),
      updatedAt: new Date(now).toISOString(),
    });
    return null;
  },
});

export const consumePasswordReset = mutation({
  args: {
    apiKey: v.string(),
    tokenHash: v.string(),
    passwordHash: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireRole(ctx, { apiKey: args.apiKey }, "admin");
    if (!args.tokenHash || !args.passwordHash) {
      throw new Error("tokenHash and passwordHash are required");
    }

    const membership = await ctx.db
      .query("memberships")
      .withIndex("by_reset_token_hash", (query) => query.eq("resetTokenHash", args.tokenHash))
      .unique();
    const expiresAt = membership?.resetTokenExpiresAt ? Date.parse(membership.resetTokenExpiresAt) : NaN;
    if (!membership || !(expiresAt > Date.now()) || membership.bannedAt) {
      throw new PostgresError({
        code: "RESET_TOKEN_INVALID",
        message: "This reset link is invalid or has expired. Ask an admin for a new one.",
      });
    }

    const now = nextPasswordUpdatedAt(membership.passwordUpdatedAt);
    await ctx.db.patch(membership._id, {
      passwordHash: args.passwordHash,
      passwordUpdatedAt: now,
      resetTokenHash: undefined,
      resetTokenExpiresAt: undefined,
      updatedAt: now,
    });
    return null;
  },
});
