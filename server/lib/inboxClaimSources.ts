import type { MutationCtx } from "../../lib/postgres/runtime/server";

export const INBOX_CLAIM_SOURCES = ["citations", "proposals", "review-recommendations"] as const;
export type InboxClaimSource = (typeof INBOX_CLAIM_SOURCES)[number];

export const INBOX_CLAIM_ITEM_ID_MAX = 200;

export const INBOX_CLAIM_EXPIRY_MS = 24 * 60 * 60 * 1000;

export function isInboxClaimSource(value: unknown): value is InboxClaimSource {
  return INBOX_CLAIM_SOURCES.some((source) => source === value);
}

export function isInboxClaimExpired(claimedAt: string, now = Date.now()): boolean {
  const at = Date.parse(claimedAt);
  return !Number.isFinite(at) || now - at >= INBOX_CLAIM_EXPIRY_MS;
}

export async function clearInboxClaim(ctx: MutationCtx, source: InboxClaimSource, itemId: string): Promise<void> {
  const rows = await ctx.db
    .query("inboxClaims")
    .withIndex("by_source_item", (q) => q.eq("source", source).eq("item_id", itemId))
    .collect();
  for (const row of rows) {
    await ctx.db.delete(row._id);
  }
}
