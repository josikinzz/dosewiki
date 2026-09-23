import { v } from "../lib/postgres/runtime/values";
import { internalMutation } from "./lib/indexedMutation";
import { isPublicationTarget } from "../lib/next/publicationWire";
import { PUBLICATION_OUTBOX_MAX_ATTEMPTS } from "./lib/publicationOutbox";

const CLAIM_LIMIT = 18;

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
      if (current) await ctx.db.patch(current._id, { ...value, deadLetteredAt: undefined });
      else await ctx.db.insert("publicCachePublications", value);
    }
  },
});

/**
 * A lease, not an acknowledgement: crashed actions become due again. Fresh
 * rows (never attempted) are claimed ahead of retries so failing rows cannot
 * fill every slot. A retry already at the attempt cap, whose last lease
 * expired without a receipt, becomes a dead letter instead of a claim.
 */
export const claimDue = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const fresh = await ctx.db.query("publicCachePublications")
      .withIndex("by_fresh", (q) => q.eq("pending", true).eq("attempts", 0).lte("nextAttemptAt", now))
      .take(CLAIM_LIMIT);
    const claimedIds = new Set(fresh.map((row) => row._id));
    const due = fresh.length < CLAIM_LIMIT
      ? await ctx.db.query("publicCachePublications")
        .withIndex("by_due", (q) => q.eq("pending", true).lte("nextAttemptAt", now))
        .take(CLAIM_LIMIT + fresh.length)
      : [];
    const retries = due.filter((row) => !claimedIds.has(row._id)).slice(0, CLAIM_LIMIT - fresh.length);
    const rows = [...fresh];
    for (const row of retries) {
      if (row.attempts >= PUBLICATION_OUTBOX_MAX_ATTEMPTS) {
        await ctx.db.patch(row._id, { pending: false, nextAttemptAt: 0, deadLetteredAt: now });
        continue;
      }
      rows.push(row);
    }
    for (const row of rows) {
      await ctx.db.patch(row._id, { nextAttemptAt: now + 120_000, attempts: row.attempts + 1 });
    }
    return rows;
  },
});

/**
 * Acknowledge one claimed generation. A failed delivery backs off; once it has
 * used the attempt cap, or `permanent` says no retry can succeed, the row stops
 * retrying and keeps its receipts as a dead letter.
 */
export const recordDelivery = internalMutation({
  args: {
    id: v.id("publicCachePublications"), generation: v.number(),
    complete: v.boolean(), receipts: v.array(v.any()), permanent: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const current = await ctx.db.get(args.id);
    // A late old receipt cannot acknowledge a newer commit.
    if (!current || current.generation !== args.generation) return;
    const now = Date.now();
    const deadLetter = !args.complete && (args.permanent === true || current.attempts >= PUBLICATION_OUTBOX_MAX_ATTEMPTS);
    await ctx.db.patch(args.id, {
      pending: !args.complete && !deadLetter,
      nextAttemptAt: args.complete || deadLetter ? 0 : now + Math.min(300_000, 15_000 * 2 ** Math.min(current.attempts, 5)),
      ...(deadLetter ? { deadLetteredAt: now } : {}),
      receipts: [
        ...current.receipts.filter((receipt: { target?: string; generation?: number }) =>
          receipt.target === "translation-queue" && receipt.generation === args.generation),
        ...args.receipts,
      ],
    });
  },
});
