import { PostgresError, v } from "../lib/postgres/runtime/values";
import { query, type MutationCtx, type QueryCtx } from "../lib/postgres/runtime/server";
import { mutation } from "./lib/indexedMutation";
import { requireRole } from "./lib/auth";
import { assertDataWritesNotFrozen } from "../lib/runtime/dataWriteFreeze";
import {
  INBOX_CLAIM_ITEM_ID_MAX,
  INBOX_CLAIM_SOURCES,
  isInboxClaimExpired,
  isInboxClaimSource,
  type InboxClaimSource,
} from "./lib/inboxClaimSources";

export { INBOX_CLAIM_SOURCES, type InboxClaimSource };

export type InboxClaim = {
  source: InboxClaimSource;
  item_id: string;
  claimed_by: string;
  claimed_at: string;
};

export type ListedInboxClaim = InboxClaim & { expired: boolean };

const sourceValidator = v.union(...INBOX_CLAIM_SOURCES.map((source) => v.literal(source)));

type ActorArgs = { apiKey?: string; actorEmail?: string };
type ItemArgs = ActorArgs & { source: InboxClaimSource; item_id: string };
type ClaimRow = InboxClaim & { _id: string };

function requireAdmin(ctx: MutationCtx | QueryCtx, args: ActorArgs) {
  return requireRole(ctx, { apiKey: args.apiKey, actorEmail: args.actorEmail, adminIntent: "editorArticleWrite" }, "admin");
}

function assertItem(args: ItemArgs) {
  if (!isInboxClaimSource(args.source)) {
    throw new PostgresError({ code: "INBOX_CLAIM_INVALID", message: "Unknown Inbox source." });
  }
  if (!args.item_id.trim() || args.item_id.length > INBOX_CLAIM_ITEM_ID_MAX) {
    throw new PostgresError({ code: "INBOX_CLAIM_INVALID", message: "An Inbox claim needs a valid item id." });
  }
}

async function claimRow(ctx: MutationCtx | QueryCtx, source: InboxClaimSource, itemId: string) {
  return (await ctx.db
    .query("inboxClaims")
    .withIndex("by_source_item", (q) => q.eq("source", source).eq("item_id", itemId))
    .first()) as ClaimRow | null;
}

function publicClaim(row: InboxClaim): InboxClaim {
  return { source: row.source, item_id: row.item_id, claimed_by: row.claimed_by, claimed_at: row.claimed_at };
}

export async function listClaimsHandler(ctx: QueryCtx, args: ActorArgs): Promise<ListedInboxClaim[]> {
  await requireAdmin(ctx, args);
  const rows = await ctx.db.query("inboxClaims").collect();
  const now = Date.now();
  return rows.map((row) => {
    const claim = publicClaim(row as InboxClaim);
    return { ...claim, expired: isInboxClaimExpired(claim.claimed_at, now) };
  });
}

async function holdFor(ctx: MutationCtx, args: ItemArgs, claimedBy: string, existing: ClaimRow | null): Promise<InboxClaim> {
  const claim: InboxClaim = {
    source: args.source,
    item_id: args.item_id,
    claimed_by: claimedBy,
    claimed_at: new Date().toISOString(),
  };
  if (existing) {
    await ctx.db.patch(existing._id as never, { claimed_by: claim.claimed_by, claimed_at: claim.claimed_at });
  } else {
    await ctx.db.insert("inboxClaims", claim);
  }
  return claim;
}

export async function claimHandler(ctx: MutationCtx, args: ItemArgs): Promise<InboxClaim> {
  assertDataWritesNotFrozen("inboxClaims:claim");
  const actor = await requireAdmin(ctx, args);
  assertItem(args);
  const existing = await claimRow(ctx, args.source, args.item_id);
  if (existing && !isInboxClaimExpired(existing.claimed_at)) {
    if (existing.claimed_by === actor.email) return publicClaim(existing);
    throw new PostgresError({
      code: "INBOX_CLAIM_HELD",
      message: `${existing.claimed_by} is already working on this item.`,
      claimedBy: existing.claimed_by,
    });
  }
  return holdFor(ctx, args, actor.email, existing);
}

export async function takeOverHandler(ctx: MutationCtx, args: ItemArgs): Promise<InboxClaim> {
  assertDataWritesNotFrozen("inboxClaims:takeOver");
  const actor = await requireAdmin(ctx, args);
  assertItem(args);
  return holdFor(ctx, args, actor.email, await claimRow(ctx, args.source, args.item_id));
}

export async function releaseHandler(ctx: MutationCtx, args: ItemArgs): Promise<{ released: boolean }> {
  assertDataWritesNotFrozen("inboxClaims:release");
  const actor = await requireAdmin(ctx, args);
  assertItem(args);
  const existing = await claimRow(ctx, args.source, args.item_id);
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

const itemArgs = {
  apiKey: v.optional(v.string()),
  actorEmail: v.optional(v.string()),
  source: sourceValidator,
  item_id: v.string(),
};

export const list = query({
  args: { apiKey: v.optional(v.string()), actorEmail: v.optional(v.string()) },
  handler: listClaimsHandler,
});

export const claim = mutation({ args: itemArgs, handler: claimHandler });

export const takeOver = mutation({ args: itemArgs, handler: takeOverHandler });

export const release = mutation({ args: itemArgs, handler: releaseHandler });
