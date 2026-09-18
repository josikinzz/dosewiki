import { PostgresError, v } from "../lib/postgres/runtime/values";
import type { Doc } from "../lib/postgres/runtime/dataModel";
import { query } from "../lib/postgres/runtime/server";
import { mutation } from "./lib/indexedMutation";
import { requireRole } from "./lib/auth";
import { approvedGlossaryLocales, parseGlossaryLocaleGrant } from "../src/lib/auth/roles";

/**
 * Invite codes: the only way an account is created.
 *
 * `mint`, `list` and `revoke` are admin surfaces reached through the /dev
 * Members tab with the session actor. `redeem` is the public accept step:
 * the Next route hashes the code the visitor typed, hashes their password and
 * calls in with the server key alone, so `requireRole` resolves it to admin
 * the way it does for scripts. Nothing here ever returns a code hash.
 *
 * Refusals are `PostgresError({ code, message })` so the routes can map them to
 * plain 4xx responses without parsing prose.
 */

const inviteRoleValidator = v.union(v.literal("editor"), v.literal("translator"), v.literal("editor_translator"), v.literal("contributor"));

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_EXPIRES_IN_DAYS = 7;
const MAX_EXPIRES_IN_DAYS = 365;
const DEFAULT_MAX_USES = 1;
const MAX_MAX_USES = 100;
const MAX_NOTE_LENGTH = 200;

export type InviteCodeStatus = "active" | "expired" | "exhausted" | "revoked";

type InviteCodeRow = {
  expiresAt: string;
  maxUses: number;
  redemptions: { email: string; at: string }[];
  revokedAt?: string;
};

export function inviteCodeStatus(row: InviteCodeRow, now: number): InviteCodeStatus {
  if (row.revokedAt) return "revoked";
  if (row.redemptions.length >= row.maxUses) return "exhausted";
  if (Date.parse(row.expiresAt) <= now) return "expired";
  return "active";
}

const refuse = (code: string, message: string) => new PostgresError({ code, message });

const normalizeEmail = (email: string) => email.trim().toLowerCase();
const normalizeUsername = (username: string) => username.trim().toLowerCase();

const inviteCodeSummaryValidator = v.object({
  id: v.id("inviteCodes"),
  role: inviteRoleValidator,
  glossaryLocales: v.optional(v.array(v.string())),
  createdBy: v.string(),
  createdAt: v.string(),
  expiresAt: v.string(),
  maxUses: v.number(),
  redemptions: v.array(v.object({ email: v.string(), at: v.string() })),
  revokedAt: v.optional(v.string()),
  note: v.optional(v.string()),
  status: v.union(
    v.literal("active"),
    v.literal("expired"),
    v.literal("exhausted"),
    v.literal("revoked"),
  ),
});

/** The admin-facing projection: everything but the hash, plus the derived status. */
function summarize(row: Doc<"inviteCodes">, now: number) {
  return {
    id: row._id,
    role: row.role,
    glossaryLocales: approvedGlossaryLocales(row),
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
    maxUses: row.maxUses,
    redemptions: row.redemptions,
    revokedAt: row.revokedAt,
    note: row.note,
    status: inviteCodeStatus(row, now),
  };
}

export const mint = mutation({
  args: {
    apiKey: v.string(),
    actorEmail: v.string(),
    role: inviteRoleValidator,
    glossaryLocales: v.optional(v.array(v.string())),
    codeHash: v.string(),
    note: v.optional(v.string()),
    expiresInDays: v.optional(v.number()),
    maxUses: v.optional(v.number()),
  },
  returns: inviteCodeSummaryValidator,
  handler: async (ctx, args) => {
    const actor = await requireRole(ctx, args, "admin");
    const glossaryLocales = parseGlossaryLocaleGrant(args.role, args.glossaryLocales);

    if (!/^[0-9a-f]{64}$/.test(args.codeHash)) {
      throw refuse("INVITE_HASH_INVALID", "The invite code hash is malformed.");
    }

    const expiresInDays = args.expiresInDays ?? DEFAULT_EXPIRES_IN_DAYS;
    if (!Number.isInteger(expiresInDays) || expiresInDays < 1 || expiresInDays > MAX_EXPIRES_IN_DAYS) {
      throw refuse("INVITE_EXPIRY_INVALID", `Expiry must be between 1 and ${MAX_EXPIRES_IN_DAYS} days.`);
    }

    const maxUses = args.maxUses ?? DEFAULT_MAX_USES;
    if (!Number.isInteger(maxUses) || maxUses < 1 || maxUses > MAX_MAX_USES) {
      throw refuse("INVITE_USES_INVALID", `Uses must be between 1 and ${MAX_MAX_USES}.`);
    }

    const note = args.note?.trim();
    if (note && note.length > MAX_NOTE_LENGTH) {
      throw refuse("INVITE_NOTE_TOO_LONG", `Notes are limited to ${MAX_NOTE_LENGTH} characters.`);
    }

    const existing = await ctx.db
      .query("inviteCodes")
      .withIndex("by_code_hash", (query) => query.eq("codeHash", args.codeHash))
      .unique();
    if (existing) {
      throw refuse("INVITE_HASH_TAKEN", "That invite code already exists; mint another.");
    }

    const now = Date.now();
    const id = await ctx.db.insert("inviteCodes", {
      codeHash: args.codeHash,
      role: args.role,
      glossaryLocales,
      createdBy: actor.email,
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + expiresInDays * DAY_MS).toISOString(),
      maxUses,
      redemptions: [],
      ...(note ? { note } : {}),
    });

    return summarize((await ctx.db.get(id))!, now);
  },
});

export const list = query({
  args: {
    apiKey: v.string(),
    actorEmail: v.string(),
    cursor: v.optional(v.string()),
  },
  returns: v.object({
    invites: v.array(inviteCodeSummaryValidator),
    continuationCursor: v.union(v.string(), v.null()),
  }),
  handler: async (ctx, args) => {
    await requireRole(ctx, args, "admin");

    const page = await ctx.db
      .query("inviteCodes")
      .withIndex("by_created_at")
      .order("desc")
      .paginate({ cursor: args.cursor ?? null, numItems: 100 });
    const now = Date.now();

    return {
      invites: page.page.map((row) => summarize(row, now)),
      continuationCursor: page.isDone ? null : page.continueCursor,
    };
  },
});

export const revoke = mutation({
  args: {
    apiKey: v.string(),
    actorEmail: v.string(),
    id: v.id("inviteCodes"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireRole(ctx, args, "admin");

    const row = await ctx.db.get(args.id);
    if (!row) {
      throw refuse("INVITE_UNKNOWN", "That invite code does not exist.");
    }
    if (row.revokedAt) {
      return null;
    }
    if (row.redemptions.length >= row.maxUses) {
      throw refuse("INVITE_EXHAUSTED", "That invite code has already been fully redeemed; there is nothing to revoke.");
    }

    await ctx.db.patch(args.id, { revokedAt: new Date().toISOString() });
    return null;
  },
});

export const redeem = mutation({
  args: {
    apiKey: v.string(),
    codeHash: v.string(),
    username: v.string(),
    email: v.optional(v.string()),
    name: v.optional(v.string()),
    passwordHash: v.string(),
  },
  returns: v.object({
    email: v.string(),
    role: inviteRoleValidator,
  }),
  handler: async (ctx, args) => {
    await requireRole(ctx, { apiKey: args.apiKey }, "admin");

    const code = await ctx.db
      .query("inviteCodes")
      .withIndex("by_code_hash", (query) => query.eq("codeHash", args.codeHash))
      .unique();
    if (!code) {
      throw refuse("INVITE_UNKNOWN", "That invite code is not recognised.");
    }

    const now = Date.now();
    switch (inviteCodeStatus(code, now)) {
      case "revoked":
        throw refuse("INVITE_REVOKED", "That invite code has been revoked.");
      case "exhausted":
        throw refuse("INVITE_EXHAUSTED", "That invite code has already been used.");
      case "expired":
        throw refuse("INVITE_EXPIRED", "That invite code has expired.");
      case "active":
        break;
    }

    const username = normalizeUsername(args.username);
    const email = normalizeEmail(args.email?.trim() ? args.email : `${username}@members.dose.wiki`);

    const usernameTaken = await ctx.db
      .query("memberships")
      .withIndex("by_username", (query) => query.eq("username", username))
      .unique();
    if (usernameTaken) {
      throw refuse("USERNAME_TAKEN", "That username is already taken.");
    }

    const emailTaken = await ctx.db
      .query("memberships")
      .withIndex("by_email", (query) => query.eq("email", email))
      .unique();
    if (emailTaken) {
      throw refuse("EMAIL_TAKEN", "An account with that email already exists.");
    }

    const at = new Date(now).toISOString();
    const name = args.name?.trim();

    await ctx.db.insert("memberships", {
      email,
      username,
      passwordHash: args.passwordHash,
      passwordUpdatedAt: at,
      role: code.role,
      glossaryLocales: approvedGlossaryLocales(code),
      invitedBy: code.createdBy,
      inviteCodeId: code._id,
      createdAt: at,
      updatedAt: at,
      lastSeenAt: at,
      ...(name ? { name } : {}),
    });

    await ctx.db.patch(code._id, {
      redemptions: [...code.redemptions, { email, at }],
    });

    return { email, role: code.role };
  },
});
