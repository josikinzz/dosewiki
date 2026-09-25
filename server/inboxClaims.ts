import { PostgresError, v } from "../lib/postgres/runtime/values";
import { query, type MutationCtx, type QueryCtx } from "../lib/postgres/runtime/server";
import { mutation } from "./lib/indexedMutation";
import { requireRole } from "./lib/auth";
import { assertDataWritesNotFrozen } from "../lib/runtime/dataWriteFreeze";

/**
 * Claims on Inbox items whose own record has no Reviewing status: citation
 * articles (by slug), change proposals (by id) and review recommendations (by
 * slug). A claim names the admin working the item so a second admin does not
 * triage it too. Trip reports and feedback never land here: claiming one moves
 * it to Reviewing, and its decision log records who did.
 *
 * Admin floor for reads and writes, like every queue the Inbox gathers.
 */

export const INBOX_CLAIM_SOURCES = ["citations", "proposals", "review-recommendations"] as const;
export type InboxClaimSource = (typeof INBOX_CLAIM_SOURCES)[number];

export type InboxClaim = {
  source: InboxClaimSource;
  item_id: string;
  claimed_by: string;
  claimed_at: string;
};

const sourceValidator = v.union(
  v.literal("citations"),
  v.literal("proposals"),
  v.literal("review-recommendations"),
);

type ActorArgs = { apiKey?: string; actorEmail?: string };
type ItemArgs = ActorArgs & { source: InboxClaimSource; item_id: string };

const ITEM_ID_MAX = 200;

function requireAdmin(ctx: MutationCtx | QueryCtx, args: ActorArgs) {
  return requireRole(ctx, { apiKey: args.apiKey, actorEmail: args.actorEmail, adminIntent: "editorArticleWrite" }, "admin");
}

function assertItem(args: ItemArgs) {
  if (!INBOX_CLAIM_SOURCES.includes(args.source)) {
    throw new PostgresError({ code: "INBOX_CLAIM_INVALID", message: "Unknown Inbox source." });
  }
  if (!args.item_id.trim() || args.item_id.length > ITEM_ID_MAX) {
    throw new PostgresError({ code: "INBOX_CLAIM_INVALID", message: "An Inbox claim needs a valid item id." });
  }
}

function claimRow(ctx: MutationCtx | QueryCtx, source: InboxClaimSource, itemId: string) {
  return ctx.db
    .query("inboxClaims")
    .withIndex("by_source_item", (q) => q.eq("source", source).eq("item_id", itemId))
    .first();
}

function publicClaim(row: InboxClaim): InboxClaim {
  return { source: row.source, item_id: row.item_id, claimed_by: row.claimed_by, claimed_at: row.claimed_at };
}

export async function listClaimsHandler(ctx: QueryCtx, args: ActorArgs): Promise<InboxClaim[]> {
  await requireAdmin(ctx, args);
  const rows = await ctx.db.query("inboxClaims").collect();
  return rows.map((row) => publicClaim(row as InboxClaim));
}

/**
 * Claim an item for the calling admin. Claiming an item you already hold is a
 * no-op; an item another admin holds is refused with their name, so the Inbox
 * can say who has it instead of silently taking it over.
 */
export async function claimHandler(ctx: MutationCtx, args: ItemArgs): Promise<InboxClaim> {
  assertDataWritesNotFrozen("inboxClaims:claim");
  const actor = await requireAdmin(ctx, args);
  assertItem(args);
  const existing = (await claimRow(ctx, args.source, args.item_id)) as (InboxClaim & { _id: string }) | null;
  if (existing) {
    if (existing.claimed_by === actor.email) return publicClaim(existing);
    throw new PostgresError({
      code: "INBOX_CLAIM_HELD",
      message: `${existing.claimed_by} is already working on this item.`,
      claimedBy: existing.claimed_by,
    });
  }
  const claim: InboxClaim = {
    source: args.source,
    item_id: args.item_id,
    claimed_by: actor.email,
    claimed_at: new Date().toISOString(),
  };
  await ctx.db.insert("inboxClaims", claim);
  return claim;
}

/** Give up a claim. Only the admin who holds it may release it. */
export async function releaseHandler(ctx: MutationCtx, args: ItemArgs): Promise<{ released: boolean }> {
  assertDataWritesNotFrozen("inboxClaims:release");
  const actor = await requireAdmin(ctx, args);
  assertItem(args);
  const existing = (await claimRow(ctx, args.source, args.item_id)) as (InboxClaim & { _id: string }) | null;
  if (!existing) return { released: false };
  if (existing.claimed_by !== actor.email) {
    throw new PostgresError({
      code: "INBOX_CLAIM_HELD",
      message: `${existing.claimed_by} holds this claim; only they can release it.`,
      claimedBy: existing.claimed_by,
    });
  }
  await ctx.db.delete(existing._id as never);
  return { released: true };
}

export const list = query({
  args: { apiKey: v.optional(v.string()), actorEmail: v.optional(v.string()) },
  handler: listClaimsHandler,
});

export const claim = mutation({
  args: {
    apiKey: v.optional(v.string()),
    actorEmail: v.optional(v.string()),
    source: sourceValidator,
    item_id: v.string(),
  },
  handler: claimHandler,
});

export const release = mutation({
  args: {
    apiKey: v.optional(v.string()),
    actorEmail: v.optional(v.string()),
    source: sourceValidator,
    item_id: v.string(),
  },
  handler: releaseHandler,
});
