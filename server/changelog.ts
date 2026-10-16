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

export const getByEntryId = query({
  args: { entryId: v.string() },
  handler: async (ctx, { entryId }) => {
    const row = await ctx.db.query("changelog")
      .withIndex("by_entry_id", (q) => q.eq("entryId", entryId)).first();
    return row ? projectPublicChangelog(row) : null;
  },
});

export const getBySubmitter = query({
  args: {
    submitters: v.array(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = Math.min(Math.max(args.limit ?? 20, 1), 100);
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
    const merged: (typeof perKey)[number] = [];
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

    const matches: ReturnType<typeof projectPublicChangelog>[] = [];
    for await (const row of ctx.db.query("changelog").withIndex("by_created_at").order("desc")) {
      if (row.articles.some((article) => article.slug === slug)) {
        matches.push(projectPublicChangelog(row));
        if (matches.length >= limit) break;
      }
    }

    return matches;
  },
});

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

