import { v } from "../lib/postgres/runtime/values";
import { internalMutation } from "./lib/indexedMutation";
import { isPublicationTarget } from "../lib/next/publicationWire";

/** Queue cache-only delivery after translated segments have committed. */
export const enqueueTranslationCacheRetry = internalMutation({
  args: { targets: v.array(v.any()) },
  handler: async (ctx, args) => {
    const now = Date.now();
    for (const candidate of args.targets) {
      if (!isPublicationTarget(candidate)) throw new Error("Invalid translation cache publication target.");
      const key = JSON.stringify(candidate.kind === "article" ? { kind: candidate.kind, slug: candidate.slug } : candidate);
      const current = await ctx.db.query("publicCachePublications").withIndex("by_key", (q) => q.eq("key", key)).unique();
      const generation = (current?.generation ?? 0) + 1;
      const value = {
        key,
        target: candidate,
        generation,
        pending: true,
        nextAttemptAt: now,
        attempts: 0,
        receipts: [{ target: "translation-queue", generation, status: "accepted", attempts: 1, jobs: [] }],
        committedAt: now,
      };
      if (current) await ctx.db.patch(current._id, value);
      else await ctx.db.insert("publicCachePublications", value);
    }
  },
});

/** A lease, not an acknowledgement: crashed actions become due again. */
export const claimDue = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const rows = await ctx.db.query("publicCachePublications")
      .withIndex("by_due", (q) => q.eq("pending", true).lte("nextAttemptAt", now))
      .take(18);
    for (const row of rows) {
      await ctx.db.patch(row._id, { nextAttemptAt: now + 120_000, attempts: row.attempts + 1 });
    }
    return rows;
  },
});

export const recordDelivery = internalMutation({
  args: {
    id: v.id("publicCachePublications"), generation: v.number(),
    complete: v.boolean(), receipts: v.array(v.any()),
  },
  handler: async (ctx, args) => {
    const current = await ctx.db.get(args.id);
    // A late old receipt cannot acknowledge a newer commit.
    if (!current || current.generation !== args.generation) return;
    await ctx.db.patch(args.id, {
      pending: !args.complete,
      nextAttemptAt: args.complete ? 0 : Date.now() + Math.min(300_000, 15_000 * 2 ** Math.min(current.attempts, 5)),
      receipts: [
        ...current.receipts.filter((receipt: { target?: string; generation?: number }) =>
          receipt.target === "translation-queue" && receipt.generation === args.generation),
        ...args.receipts,
      ],
    });
  },
});
