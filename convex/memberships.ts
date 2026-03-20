import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

const roleValidator = v.union(v.literal("admin"), v.literal("editor"), v.literal("viewer"));

const normalizeEmail = (email: string) => email.trim().toLowerCase();

export const getByEmail = query({
  args: {
    email: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("memberships")
      .withIndex("by_email", (query) => query.eq("email", normalizeEmail(args.email)))
      .unique();
  },
});

export const upsertFromAuth = mutation({
  args: {
    email: v.string(),
    name: v.optional(v.string()),
    image: v.optional(v.string()),
    provider: v.optional(v.string()),
    providerAccountId: v.optional(v.string()),
    adminEmails: v.optional(v.array(v.string())),
  },
  returns: v.object({
    membershipId: v.id("memberships"),
    role: roleValidator,
  }),
  handler: async (ctx, args) => {
    const email = normalizeEmail(args.email);
    const now = new Date().toISOString();
    const adminEmails = new Set((args.adminEmails ?? []).map(normalizeEmail));
    const existing = await ctx.db
      .query("memberships")
      .withIndex("by_email", (query) => query.eq("email", email))
      .unique();

    const role = adminEmails.has(email) ? "admin" : (existing?.role ?? "viewer");

    if (existing) {
      await ctx.db.patch(existing._id, {
        email,
        name: args.name,
        image: args.image,
        role,
        provider: args.provider,
        providerAccountId: args.providerAccountId,
        updatedAt: now,
        lastSeenAt: now,
      });

      return {
        membershipId: existing._id,
        role,
      };
    }

    const membershipId = await ctx.db.insert("memberships", {
      email,
      name: args.name,
      image: args.image,
      role,
      provider: args.provider,
      providerAccountId: args.providerAccountId,
      createdAt: now,
      updatedAt: now,
      lastSeenAt: now,
    });

    return {
      membershipId,
      role,
    };
  },
});
