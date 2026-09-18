import { v } from "../lib/postgres/runtime/values";
import { query, type MutationCtx } from "../lib/postgres/runtime/server";
import { mutation, internalMutation } from "./lib/indexedMutation";
import { requireRole } from "./lib/auth";
import { projectPublicChangelog } from "../lib/changelog/publicChangelog";
import {
  projectPublicChangelogSummaries,
  type PublicChangelogSummaryInput,
} from "../lib/changelog/publicChangelogSummary";
import { publicReadIndexReady } from "./lib/publicReadIndexes";

/**
 * Query to get all changelog entries.
 * Returns entries sorted by createdAt descending (newest first).
 * Uses index for efficient ordering.
 */
export const getAll = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db
      .query("changelog")
      .withIndex("by_created_at")
      .order("desc")
      .collect();
    return rows.map(projectPublicChangelog);
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
    const rows = await ctx.db
      .query("changelog")
      .withIndex("by_created_at")
      .order("desc")
      .take(limit);
    return rows.map(projectPublicChangelog);
  },
});

/** Compact public list rows; full markdown remains addressable through getByEntryId. */
export const getRecentSummaries = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = Math.min(args.limit ?? 50, 500);
    const rows = await ctx.db
      .query("changelog")
      .withIndex("by_created_at")
      .order("desc")
      .take(limit);
    return projectPublicChangelogSummaries(rows, null);
  },
});

/** One addressable public history entry, with the same privacy projection as lists. */
export const getByEntryId = query({
  args: { entryId: v.string() },
  handler: async (ctx, { entryId }) => {
    const row = await ctx.db.query("changelog")
      .withIndex("by_entry_id", (q) => q.eq("entryId", entryId)).first();
    return row ? projectPublicChangelog(row) : null;
  },
});

/**
 * Query changelog entries stamped by any of the given submitter keys.
 *
 * Powers the public contributor profile history: the caller passes the
 * profile key plus its legacy stamp aliases (a retired handle group) and gets
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

    return merged.slice(0, limit).map(projectPublicChangelog);
  },
});

/**
 * Newest-first changelog rows that touched one article, by slug.
 *
 * Ready reads walk the per-article relation and hydrate only the newest
 * winners. The temporary pre-backfill path remains complete, not scan-capped.
 */
export const getByArticleSlug = query({
  args: {
    slug: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = Math.min(Math.max(args.limit ?? 8, 1), 50);
    if (await publicReadIndexReady(ctx, "history")) {
      const links = await ctx.db.query("articleHistory")
        .withIndex("by_slug_created", (q) => q.eq("slug", args.slug))
        .order("desc").take(limit);
      const rows = await Promise.all(links.map((link) => ctx.db.get(link.changelog_id)));
      return rows.filter((row) => row !== null).map(projectPublicChangelog);
    }
    const slug = args.slug;

    const matches = [];
    for await (const row of ctx.db.query("changelog").withIndex("by_created_at").order("desc")) {
      if (row.articles.some((article) => article.slug === slug)) {
        matches.push(projectPublicChangelog(row));
        if (matches.length >= limit) break;
      }
    }

    return matches;
  },
});

/** Compact article-scoped list rows using the authoritative history ordering. */
export const getByArticleSlugSummaries = query({
  args: {
    slug: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = Math.min(Math.max(args.limit ?? 8, 1), 50);
    let rows: PublicChangelogSummaryInput[];
    if (await publicReadIndexReady(ctx, "history")) {
      const links = await ctx.db.query("articleHistory")
        .withIndex("by_slug_created", (query) => query.eq("slug", args.slug))
        .order("desc")
        .take(limit);
      rows = (await Promise.all(links.map((link) => ctx.db.get(link.changelog_id))))
        .filter((row) => row !== null);
    } else {
      rows = [];
      for await (const row of ctx.db.query("changelog").withIndex("by_created_at").order("desc")) {
        if (!row.articles.some((article) => article.slug === args.slug)) continue;
        rows.push(row);
        if (rows.length >= limit) break;
      }
    }
    return projectPublicChangelogSummaries(rows, args.slug);
  },
});

/**
 * One-off idempotent migration normalizing legacy `submittedBy` stamps from a
 * retired handle to the profile key that absorbed it (DW-21). Invoke only
 * through a trusted native maintenance client with an explicitly guarded
 * Postgres target; this is not a public API. The runtime write-freeze guard
 * and transaction controls still apply.
 *
 * First inspect the default dry-run result. Apply with `dryRun: false` only
 * after approving the target, matching rows, and submitter alias handling.
 */
export const normalizeSubmitterStamps = internalMutation({
  args: {
    from: v.string(),
    to: v.optional(v.string()),
    dryRun: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const from = args.from.trim().toUpperCase();
    if (!from) {
      throw new Error("normalizeSubmitterStamps requires the retired submitter stamp in `from`.");
    }
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
 * (`addEntry`), so bad or test rows have no other exit. Invoke only through a
 * trusted native maintenance client after guarding the target and approving
 * the exact entry IDs. Runtime write-freeze and transaction guards still apply.
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
  const publication = projectPublicChangelog(args);

  if (existing) {
    await ctx.db.patch(existing._id, {
      createdAt: publication.createdAt,
      message: publication.message,
      markdown: publication.markdown,
      submittedBy: publication.submittedBy,
      articles: publication.articles,
    });
    return { created: false, id: existing._id };
  }

  const id = await ctx.db.insert("changelog", publication);

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

