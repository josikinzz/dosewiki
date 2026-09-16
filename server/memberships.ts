import { query } from "../lib/postgres/runtime/server";
import { mutation } from "./lib/indexedMutation";
import { PostgresError, v } from "../lib/postgres/runtime/values";
import { requireRole } from "./lib/auth";

import { membershipRoleValidator as roleValidator } from "./schema";
import { parseGlossaryLocaleGrant } from "../src/lib/auth/roles";

const normalizeEmail = (email: string) => email.trim().toLowerCase();
const normalizeUsername = (username: string) => username.trim().toLowerCase();

// Every function here takes only the server key (no `actorEmail`), which
// `requireRole` resolves to admin: the Auth.js server callback and the seed
// script are the only callers, and both hold the key. The deployment URL is
// public, so nothing here may be reachable without it.

/**
 * JWT refresh lookup. Hashes and reset tokens never leave the row; the
 * projection here is the whole contract, as with `listRoster`.
 */
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
    };
  },
});

/**
 * Sign-in lookup. Returns the banned row too (with `bannedAt`) so the caller
 * can refuse it explicitly rather than treating a banned member as unknown.
 */
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

/**
 * Seeds or resets an admin account. Only `scripts/auth/seed-admin-accounts.mjs`
 * calls this; it upserts by username so re-running the seed rotates the
 * password instead of duplicating the row.
 */
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
      passwordUpdatedAt: now,
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

/**
 * One-off migration: drops the rows the retired OAuth sign-in minted as
 * `viewer`. Rows that already carry a username are accounts and are kept.
 */
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

// Roster management. Every function below takes `actorEmail` so the route's
// session decides the role; `requireRole` refuses anyone below admin.

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

/**
 * The Members tab roster. Hashes and reset tokens never leave the row; the
 * projection here is the whole contract.
 */
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

/**
 * Resolves the row an admin action targets. Admin rows are off limits to
 * every roster action (admins are seeded and rotated from a workstation), and
 * so is the actor's own row: locking yourself out is a script's job.
 */
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

/**
 * Stores a reset token the route already generated and hashed. The plaintext
 * is shown to the admin exactly once; only its sha256 hex lands here. A banned
 * member gets no link: unban first, so the ban stays the single switch.
 */
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

/**
 * Redeems a reset link. Server key only: the person resetting has no session,
 * so the token is the whole credential and the route rate-limits it like a
 * sign-in attempt. Expired and unknown tokens fail identically, and so does a
 * link whose member was banned after it was issued: a ban must not leave an
 * unexpired link that still rotates the hash.
 */
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

    const now = new Date().toISOString();
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
