import { v } from "../lib/postgres/runtime/values";
import { internalMutation } from "./lib/indexedMutation";
import {
  PUBLICATION_OUTBOX_CLAIM_LIMIT,
  planPublicationClaim,
  settlePublicationDelivery,
} from "../lib/next/publicationOutbox";

/**
 * The runtime store adapter of the publication outbox
 * (`lib/next/publicationOutbox.ts`). The policy (lease, attempt cap, backoff,
 * dead letter) lives there; this module only reads and patches rows.
 */
export const claimDue = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const fresh = await ctx.db.query("publicCachePublications")
      .withIndex("by_fresh", (q) => q.eq("pending", true).eq("attempts", 0).lte("nextAttemptAt", now))
      .take(PUBLICATION_OUTBOX_CLAIM_LIMIT);
    const due = fresh.length < PUBLICATION_OUTBOX_CLAIM_LIMIT
      ? await ctx.db.query("publicCachePublications")
        .withIndex("by_due", (q) => q.eq("pending", true).lte("nextAttemptAt", now))
        .take(PUBLICATION_OUTBOX_CLAIM_LIMIT + fresh.length)
      : [];
    const plan = planPublicationClaim(fresh, due, now);
    for (const { row, patch } of [...plan.deadLetters, ...plan.claims]) await ctx.db.patch(row._id, patch);
    return plan.claims.map(({ row, patch }) => ({ ...row, ...patch }));
  },
});

/** Acknowledge one claimed generation; a late receipt for an older generation is ignored. */
export const recordDelivery = internalMutation({
  args: {
    id: v.id("publicCachePublications"), generation: v.number(),
    complete: v.boolean(), receipts: v.array(v.any()), permanent: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const current = await ctx.db.get(args.id);
    const patch = current ? settlePublicationDelivery(current, args, Date.now()) : null;
    if (patch) await ctx.db.patch(args.id, patch);
  },
});
