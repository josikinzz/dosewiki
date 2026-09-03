import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireRole } from "./lib/auth";

import { membershipRoleValidator as roleValidator } from "./schema";

const normalizeEmail = (email: string) => email.trim().toLowerCase();
const normalizeUsername = (username: string) => username.trim().toLowerCase();

// Every function here takes only the server key (no `actorEmail`), which
// `requireRole` resolves to admin: the Auth.js server callback and the seed
// script are the only callers, and both hold the key. The deployment URL is
// public, so nothing here may be reachable without it.

export const getByEmail = query({
  args: {
    apiKey: v.string(),
    email: v.string(),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, { apiKey: args.apiKey }, "admin");

    return await ctx.db
      .query("memberships")
      .withIndex("by_email", (query) => query.eq("email", normalizeEmail(args.email)))
      .unique();
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
