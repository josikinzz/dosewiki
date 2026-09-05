import { ConvexError, v } from "convex/values";
import { query } from "./_generated/server";
import { mutation } from "./lib/indexedMutation";
import type { Doc } from "./_generated/dataModel";
import { requireRole } from "./lib/auth";

/**
 * `getAll`, `getBySlug` and `getByTag` are unauthenticated public reads, so the
 * draft filter lives here rather than in a caller: a row whose `status` is
 * "draft" never leaves the database through a public function. Legacy rows have
 * no `status` at all and are treated as published, which is the pre-existing
 * behaviour.
 */
function isPublicallyReadable(article: Doc<"effectIndexArticles">): boolean {
  return article.status !== "draft";
}

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Get all EffectIndex articles. Drafts are excluded.
 */
export const getAll = query({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("effectIndexArticles").collect();
    return all.filter(isPublicallyReadable);
  },
});

/**
 * Get a single EffectIndex article by slug. A draft reads as missing.
 */
export const getBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    const article = await ctx.db
      .query("effectIndexArticles")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .first();

    return article && isPublicallyReadable(article) ? article : null;
  },
});

/**
 * Get EffectIndex articles by tag. Drafts are excluded.
 */
export const getByTag = query({
  args: { tag: v.string() },
  handler: async (ctx, args) => {
    const all = await ctx.db.query("effectIndexArticles").collect();
    return all.filter(
      (article) => isPublicallyReadable(article) && article.tags.includes(args.tag),
    );
  },
});

/**
 * Slim editor listing for the Writing tab. Editor-gated because it is the one
 * read that sees drafts; it carries no bodies, so the tab can list the whole
 * corpus without paying for `body_raw`/`body_ast`.
 */
export const listForEditor = query({
  args: {
    apiKey: v.optional(v.string()),
    actorEmail: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, {
      apiKey: args.apiKey,
      actorEmail: args.actorEmail,
      adminIntent: "editorArticleWrite",
    }, "editor");

    const all = await ctx.db.query("effectIndexArticles").collect();

    return all.map((article) => ({
      slug: article.slug,
      title: article.title,
      kind: article.kind ?? "article",
      status: article.status ?? "published",
      publicationDate: article.publicationDate,
      creationTime: article._creationTime,
      teaser: article.teaser,
    }));
  },
});

/**
 * The whole row for one slug, drafts included: the read the Writing tab opens
 * an entry with. Editor-gated for the same reason `listForEditor` is: it is the
 * only way to see a draft body, and `getBySlug` must keep hiding one.
 */
export const getForEditor = query({
  args: {
    apiKey: v.optional(v.string()),
    actorEmail: v.optional(v.string()),
    slug: v.string(),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, {
      apiKey: args.apiKey,
      actorEmail: args.actorEmail,
      adminIntent: "editorArticleWrite",
    }, "editor");

    return await ctx.db
      .query("effectIndexArticles")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .first();
  },
});

/**
 * Admin-gated slug-keyed upsert for the Writing/Blog system. Editors read the
 * listing and detail (`listForEditor`, `getForEditor`); publishing or saving a
 * row directly is an admin action because it lands on the public site with no
 * review step.
 *
 * Update is a patch: any field the caller omits keeps its stored value, so a
 * partial save from one editor pane cannot clear what another pane owns.
 *
 * A save that carries `originalSlug` different from `slug` is a rename: the row
 * loaded under `originalSlug` moves to `slug`, and exactly one row survives.
 * Without it, saving under a new slug would insert a second row and leave the
 * old one behind.
 */
export const upsertArticle = mutation({
  args: {
    apiKey: v.optional(v.string()),
    actorEmail: v.optional(v.string()),
    slug: v.string(),
    /** The slug the editor loaded the row with; differs from `slug` on a rename. */
    originalSlug: v.optional(v.string()),
    title: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    kind: v.optional(v.union(v.literal("article"), v.literal("blog"))),
    status: v.optional(v.union(v.literal("draft"), v.literal("published"))),
    /**
     * The legacy publication flag. It is redundant with `status`, but the
     * public normalizer (`normalizePublicEffectIndexArticle`) drops any row
     * whose `publication_status` is not a string, so a row saved without it
     * would be invisible on every public surface. The editor save path sends
     * it alongside `status`.
     */
    publication_status: v.optional(v.string()),
    bodyFormat: v.optional(v.union(v.literal("vcode"), v.literal("markdown"))),
    body_raw: v.optional(v.string()),
    body_ast: v.optional(v.any()),
    teaser: v.optional(v.string()),
    coverImageUrl: v.optional(v.string()),
    authorProfileKeys: v.optional(v.array(v.string())),
    authors: v.optional(v.array(v.string())),
    featured: v.optional(v.boolean()),
    shortDescription: v.optional(v.string()),
    publicationDate: v.optional(v.string()),
    citations: v.optional(
      v.array(v.object({ url: v.string(), text: v.string() })),
    ),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, {
      apiKey: args.apiKey,
      actorEmail: args.actorEmail,
      adminIntent: "editorArticleWrite",
    }, "admin");

    const { apiKey: _apiKey, actorEmail: _actorEmail, slug, originalSlug, ...rest } = args;

    if (!SLUG_PATTERN.test(slug)) {
      throw new Error(
        `Invalid slug "${slug}": use lowercase letters, digits and single hyphens`,
      );
    }

    const renamingFrom = originalSlug !== undefined && originalSlug !== slug ? originalSlug : null;

    const existing = await ctx.db
      .query("effectIndexArticles")
      .withIndex("by_slug", (q) => q.eq("slug", renamingFrom ?? slug))
      .first();

    if (renamingFrom) {
      if (!existing) {
        throw new ConvexError({
          code: "ARTICLE_NOT_FOUND",
          message: `No article found for slug "${renamingFrom}".`,
        });
      }
      const taken = await ctx.db
        .query("effectIndexArticles")
        .withIndex("by_slug", (q) => q.eq("slug", slug))
        .first();
      if (taken) {
        throw new ConvexError({
          code: "SLUG_TAKEN",
          message: `"${slug}" already belongs to "${taken.title}". Choose another slug.`,
        });
      }
    }

    // Only fields the caller actually sent are written, so an update never
    // clears an omitted field.
    const patch = Object.fromEntries(
      Object.entries(rest).filter(([, value]) => value !== undefined),
    ) as Partial<Doc<"effectIndexArticles">>;

    const status = patch.status ?? existing?.status ?? "published";
    const body = patch.body_raw ?? existing?.body_raw ?? "";

    if (status === "published" && body.trim() === "") {
      throw new Error("Cannot publish an article with an empty body");
    }

    if (existing) {
      await ctx.db.patch(existing._id, renamingFrom ? { ...patch, slug } : patch);
      return { slug, created: false, id: existing._id };
    }

    if (patch.title === undefined) {
      throw new Error("A new article requires a title");
    }

    const id = await ctx.db.insert("effectIndexArticles", {
      slug,
      title: patch.title,
      tags: patch.tags ?? [],
      body_raw: body,
      ...patch,
    });

    return { slug, created: true, id };
  },
});

/**
 * Bulk import EffectIndex articles. Script-only; admin floor.
 */
export const bulkImport = mutation({
  args: {
    apiKey: v.optional(v.string()),
    actorEmail: v.optional(v.string()),
    articles: v.array(
      v.object({
        slug: v.string(),
        title: v.string(),
        tags: v.array(v.string()),
        publication_status: v.string(),
        featured: v.optional(v.boolean()),
        shortDescription: v.optional(v.string()),
        publicationDate: v.optional(v.string()),
        body_raw: v.string(),
        body_ast: v.optional(v.any()),
        authors: v.optional(v.array(v.string())),
        citations: v.optional(
          v.array(
            v.object({
              url: v.string(),
              text: v.string(),
            })
          )
        ),
      })
    ),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, { apiKey: args.apiKey, actorEmail: args.actorEmail }, "admin");

    const results = {
      created: 0,
      updated: 0,
      errors: [] as string[],
    };

    for (const article of args.articles) {
      try {
        // Check if article already exists
        const existing = await ctx.db
          .query("effectIndexArticles")
          .withIndex("by_slug", (q) => q.eq("slug", article.slug))
          .first();

        if (existing) {
          // Update existing article
          await ctx.db.patch(existing._id, article);
          results.updated++;
        } else {
          // Create new article
          await ctx.db.insert("effectIndexArticles", article);
          results.created++;
        }
      } catch (error) {
        results.errors.push(
          `Failed to import ${article.slug}: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }

    return results;
  },
});
