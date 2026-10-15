import { PostgresError, v } from "../lib/postgres/runtime/values";
import { query } from "../lib/postgres/runtime/server";
import { internalMutation } from "./lib/indexedMutation";
import { requireRole } from "./lib/auth";
import {
  PUBLICATION_OUTBOX_CLAIM_LIMIT,
  planPublicationClaim,
  publicationOutboxKey,
  publicationStatus,
  settlePublicationDelivery,
} from "../lib/next/publicationOutbox";
import { isPublicationTarget } from "../lib/next/publicationWire";

export const PUBLICATION_STATUS_MAX_TARGETS = 8;

export const status = query({
  args: { apiKey: v.optional(v.string()), actorEmail: v.optional(v.string()), targets: v.array(v.any()) },
  handler: async (ctx, args) => {
    await requireRole(ctx, { apiKey: args.apiKey, actorEmail: args.actorEmail, adminIntent: "editorArticleWrite" }, "contributor");
    if (args.targets.length === 0 || args.targets.length > PUBLICATION_STATUS_MAX_TARGETS || !args.targets.every(isPublicationTarget)) {
      throw new PostgresError({ code: "PUBLICATION_STATUS_TARGETS", message: `Name between 1 and ${PUBLICATION_STATUS_MAX_TARGETS} valid publication targets.` });
    }
    return await Promise.all(args.targets.map(async (target) => {
      const row = await ctx.db.query("publicCachePublications")
        .withIndex("by_key", (q) => q.eq("key", publicationOutboxKey(target)))
        .first();
      return publicationStatus(target, row);
    }));
  },
});

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
