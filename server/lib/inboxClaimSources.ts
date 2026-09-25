import type { MutationCtx } from "../../lib/postgres/runtime/server";

/**
 * The one definition of which Inbox sources claim through `inboxClaims`, and
 * how long a claim holds. The claims route validates against it before
 * calling Postgres, and the claim handlers validate against it again.
 */
export const INBOX_CLAIM_SOURCES = ["citations", "proposals", "review-recommendations"] as const;
export type InboxClaimSource = (typeof INBOX_CLAIM_SOURCES)[number];

/** Longest item id a claim may name (a slug or a proposal id). */
export const INBOX_CLAIM_ITEM_ID_MAX = 200;

/**
 * A claim nobody has touched for a day is expired: the Inbox shows it as
 * "Claim expired" and any admin may claim the item without taking it over.
 */
export const INBOX_CLAIM_EXPIRY_MS = 24 * 60 * 60 * 1000;

export function isInboxClaimSource(value: unknown): value is InboxClaimSource {
  return INBOX_CLAIM_SOURCES.some((source) => source === value);
}

export function isInboxClaimExpired(claimedAt: string, now = Date.now()): boolean {
  const at = Date.parse(claimedAt);
  return !Number.isFinite(at) || now - at >= INBOX_CLAIM_EXPIRY_MS;
}

/**
 * Drop the claim on an item that just left the Inbox (decided, applied,
 * approved), inside the deciding write. A claim must not outlive its item and
 * reappear when the same slug or id is queued again.
 */
export async function clearInboxClaim(ctx: MutationCtx, source: InboxClaimSource, itemId: string): Promise<void> {
  const rows = await ctx.db
    .query("inboxClaims")
    .withIndex("by_source_item", (q) => q.eq("source", source).eq("item_id", itemId))
    .collect();
  for (const row of rows) {
    await ctx.db.delete(row._id);
  }
}
