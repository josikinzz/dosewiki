import { v } from "convex/values";
import { query, mutation, internalMutation, type MutationCtx } from "./_generated/server";
import { requireRole } from "./lib/auth";

/**
 * Query to get all changelog entries.
 * Returns entries sorted by createdAt descending (newest first).
 * Uses index for efficient ordering.
 */
export const getAll = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("changelog")
      .withIndex("by_created_at")
      .order("desc")
      .collect();
  },
});

/**
 * Query to get recent changelog entries (limited).
 * Uses index for efficient ordering with take().
 */
export const getRecent = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = Math.min(args.limit ?? 50, 500);
    return await ctx.db
      .query("changelog")
      .withIndex("by_created_at")
      .order("desc")
      .take(limit);
  },
});

/**
 * Query changelog entries stamped by any of the given submitter keys.
 *
 * Powers the public contributor profile history: the caller passes the
 * profile key plus its legacy stamp aliases (e.g. LYREA + WITCHY) and gets
 * one merged, newest-first list back. Keys are matched exactly against the
 * stored `submittedBy` stamp via the `by_submitted_by` index, so callers
 * must pass normalized (uppercase) keys.
 */
export const getBySubmitter = query({
  args: {
    submitters: v.array(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = Math.min(Math.max(args.limit ?? 20, 1), 100);
    // A profile carries at most a handful of aliases (times two: callers send
    // upper and lower case variants because the index match is exact); cap
    // defensively.
    const submitters = [...new Set(args.submitters)].slice(0, 16);

    const perKey = await Promise.all(
      submitters.map((submittedBy) =>
        ctx.db
          .query("changelog")
          .withIndex("by_submitted_by", (q) => q.eq("submittedBy", submittedBy))
          .take(limit),
      ),
    );

    const seen = new Set<string>();
    const merged = [];
    for (const rows of perKey) {
      for (const row of rows) {
        if (seen.has(row.entryId)) continue;
        seen.add(row.entryId);
        merged.push(row);
      }
    }

    merged.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    return merged.slice(0, limit).map((row) => ({
      entryId: row.entryId,
      createdAt: row.createdAt,
      message: row.message,
      markdown: row.markdown,
      submittedBy: row.submittedBy,
      articles: row.articles,
    }));
  },
});

/**
 * Newest-first changelog rows that touched one article, by slug.
 *
 * Powers the public article's "Recent changes" disclosure. `articles` is an
 * array field, which Convex cannot index into, so this walks `by_created_at`
 * descending and filters in the handler, stopping as soon as `limit` matches
 * are in hand or `scanCap` rows have been read. The cap bounds the worst case
 * (an article nobody has ever edited) to one bounded index walk; promote to a
 * junction table with a `by_slug_created` index if the table outgrows it.
 */
export const getByArticleSlug = query({
  args: {
    slug: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = Math.min(Math.max(args.limit ?? 8, 1), 50);
    const scanCap = 2000;
    const slug = args.slug;

    const matches = [];
    let scanned = 0;
    for await (const row of ctx.db.query("changelog").withIndex("by_created_at").order("desc")) {
      scanned += 1;
      if (row.articles.some((article) => article.slug === slug)) {
        matches.push({
          entryId: row.entryId,
          createdAt: row.createdAt,
          message: row.message,
          markdown: row.markdown,
          submittedBy: row.submittedBy,
          articles: row.articles,
        });
        if (matches.length >= limit) break;
      }
      if (scanned >= scanCap) break;
    }

    return matches;
  },
});

/**
 * One-off idempotent migration normalizing legacy `submittedBy` stamps
 * (DW-21: WITCHY → LYREA). Internal: only runnable via `npx convex run`
 * with deployment credentials, never from the public API surface.
 *
 * Dry run (default):
 *   npx convex run changelog:normalizeSubmitterStamps '{}'
 * Apply on dev:
 *   npx convex run changelog:normalizeSubmitterStamps '{"dryRun": false}'
 * Apply on prod (run only after DW-10 alias matching is deployed):
 *   npx convex run changelog:normalizeSubmitterStamps '{"dryRun": false}' --prod
 */
export const normalizeSubmitterStamps = internalMutation({
  args: {
    from: v.optional(v.string()),
    to: v.optional(v.string()),
    dryRun: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const from = args.from ?? "WITCHY";
    const to = args.to ?? "LYREA";
    const dryRun = args.dryRun ?? true;

    const rows = await ctx.db
      .query("changelog")
      .withIndex("by_submitted_by", (q) => q.eq("submittedBy", from))
      .collect();

    if (!dryRun) {
      for (const row of rows) {
        await ctx.db.patch(row._id, { submittedBy: to });
      }
    }

    return {
      dryRun,
      from,
      to,
      matched: rows.length,
      patched: dryRun ? 0 : rows.length,
      entryIds: rows.map((row) => row.entryId),
    };
  },
});

/**
 * Admin removal of changelog rows by entryId. The public API is upsert-only
 * (`addEntry`), so bad or test rows have no other exit. Internal: only
 * runnable via `npx convex run` with deployment credentials.
 */
export const removeEntries = internalMutation({
  args: { entryIds: v.array(v.string()) },
  handler: async (ctx, args) => {
    let removed = 0;
    for (const entryId of args.entryIds) {
      const existing = await ctx.db
        .query("changelog")
        .withIndex("by_entry_id", (q) => q.eq("entryId", entryId))
        .first();
      if (existing) {
        await ctx.db.delete(existing._id);
        removed += 1;
      }
    }
    return { removed };
  },
});

type ChangelogEntryArgs = {
  apiKey?: string;
  actorEmail?: string;
  entryId: string;
  createdAt: string;
  message: string;
  markdown: string;
  submittedBy: string | null;
  articles: Array<{ id: number; title: string; slug: string }>;
};

/**
 * The upsert behind `addEntry`, also what a change-proposal apply or revert
 * stamps its entry through. Keyed by `entryId`: a repeated id updates the
 * existing row instead of duplicating it.
 */
export async function addEntryHandler(ctx: MutationCtx, args: ChangelogEntryArgs) {
  await requireRole(ctx, {
    apiKey: args.apiKey,
    actorEmail: args.actorEmail,
    adminIntent: "editorArticleWrite",
  }, "editor");

  const existing = await ctx.db
    .query("changelog")
    .withIndex("by_entry_id", (q) => q.eq("entryId", args.entryId))
    .first();

  if (existing) {
    await ctx.db.patch(existing._id, {
      createdAt: args.createdAt,
      message: args.message,
      markdown: args.markdown,
      submittedBy: args.submittedBy,
      articles: args.articles,
    });
    return { created: false, id: existing._id };
  }

  const id = await ctx.db.insert("changelog", {
    entryId: args.entryId,
    createdAt: args.createdAt,
    message: args.message,
    markdown: args.markdown,
    submittedBy: args.submittedBy,
    articles: args.articles,
  });

  return { created: true, id };
}

/**
 * Mutation to add a new changelog entry.
 */
export const addEntry = mutation({
  args: {
    apiKey: v.optional(v.string()),
    actorEmail: v.optional(v.string()),
    entryId: v.string(),
    createdAt: v.string(),
    message: v.string(),
    markdown: v.string(),
    submittedBy: v.union(v.string(), v.null()),
    articles: v.array(v.object({
      id: v.number(),
      title: v.string(),
      slug: v.string(),
    })),
  },
  handler: addEntryHandler,
});

