import { assertDataWritesNotFrozen } from "../lib/runtime/dataWriteFreeze";
import { PostgresError, v, type Infer, type ObjectType } from "../lib/postgres/runtime/values";
import { internalQuery, query, type MutationCtx } from "../lib/postgres/runtime/server";
import { mutation } from "./lib/indexedMutation";
import type { Doc } from "../lib/postgres/runtime/dataModel";
import { requireRole } from "./lib/auth";
import { contentHash } from "../lib/proposals/contentHash";
import { prepareVCode } from "../src/features/effects/vcode/editing";
import { currentNarrativeRevision, narrativeRevision, recordNarrativeMaintenance, recordNarrativeRevision } from "./lib/narrativeRevisions";
import { articleReadMinutes, deriveDescription } from "../src/features/articles/domain/articlesIndex";
import { buildBlogPostExcerpt } from "../src/features/blog/domain/blogPostModel";

function isPublicallyReadable(article: Doc<"effectIndexArticles">): boolean {
  return article.status !== "draft";
}

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const getAll = query({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("effectIndexArticles").collect();
    return all.filter(isPublicallyReadable);
  },
});

export const getAllDocumentsForBackup = internalQuery({
  args: {},
  handler: async (ctx) => await ctx.db.query("effectIndexArticles").collect(),
});

export const getPublishedIndex = query({
  args: { kind: v.union(v.literal("article"), v.literal("blog")) },
  handler: async (ctx, { kind }) => {
    const rows = await ctx.db.getPublishedPublicationIndex(kind);
    return rows.map((row) => {
      const body = typeof row.body_raw === "string" ? row.body_raw : undefined;
      const description = typeof row.shortDescription === "string" ? row.shortDescription : undefined;
      return Object.fromEntries(Object.entries({
        slug: row.slug, title: row.title, tags: row.tags, publication_status: row.publication_status,
        featured: row.featured, publicationDate: row.publicationDate,
        authors: row.authors, authorProfileKeys: row.authorProfileKeys,
        kind: row.kind, bodyFormat: row.bodyFormat, teaser: row.teaser, coverImageUrl: row.coverImageUrl,
        shortDescription: description,
        indexDescription: description?.trim() ? description : deriveDescription(
          typeof row.description_source === "string" ? row.description_source : body,
        ),
        readMinutes: typeof row.readMinutes === "number" ? row.readMinutes : articleReadMinutes(body),
        excerpt: buildBlogPostExcerpt(typeof row.excerpt_source === "string" ? row.excerpt_source : body ?? ""),
      }).filter(([, value]) => value !== undefined && value !== null));
    });
  },
});

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

export const getByTag = query({
  args: { tag: v.string() },
  handler: async (ctx, args) => {
    const all = await ctx.db.query("effectIndexArticles").collect();
    return all.filter(
      (article) => isPublicallyReadable(article) && article.tags.includes(args.tag),
    );
  },
});

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
      tags: article.tags,
    }));
  },
});

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

    const article = await ctx.db
      .query("effectIndexArticles")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .first();
    if (!article) return null;
    const revisions = await ctx.db.query("narrativeRevisions").withIndex("by_document", q => q.eq("kind", "writing").eq("documentId", article._id)).order("desc").take(5);
    return { ...article, baseRevision: narrativeRevision(article, revisions[0]?.operationId ?? null), history: revisions.map(({ createdAt, actorEmail, revision, before, after }) => ({ createdAt, actorEmail, revision, before, after })) };
  },
});

const upsertArticleArgs = {
  apiKey: v.optional(v.string()),
  actorEmail: v.optional(v.string()),
  slug: v.string(),
  originalSlug: v.optional(v.string()),
  expectedRevision: v.string(),
  operationId: v.string(),
  intent: v.union(v.literal("save-unpublished"), v.literal("publish")),
  title: v.optional(v.string()),
  tags: v.optional(v.array(v.string())),
  kind: v.optional(v.union(v.literal("article"), v.literal("blog"))),
  status: v.optional(v.union(v.literal("draft"), v.literal("published"))),
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
};

export type UpsertWritingArticleArgs = ObjectType<typeof upsertArticleArgs>;

export async function upsertWritingArticleHandler(ctx: MutationCtx, args: UpsertWritingArticleArgs) {
  assertDataWritesNotFrozen("effectIndexArticles:upsertArticle");
  const actor = await requireRole(ctx, {
    apiKey: args.apiKey,
    actorEmail: args.actorEmail,
    adminIntent: "editorArticleWrite",
  }, "admin");

  const { apiKey: _apiKey, actorEmail: _actorEmail, slug, originalSlug, expectedRevision, operationId, intent, ...rest } = args;
  if (intent !== "save-unpublished" && intent !== "publish") {
    throw new PostgresError({ code: "INVALID_WRITING", message: "An explicit Writing save or publication intent is required." });
  }
  const requestHash = contentHash({ intent, slug, originalSlug, ...rest });
  if (!/^[a-f0-9-]{36}$/i.test(operationId)) throw new PostgresError({ code: "INVALID_WRITING", message: "A valid publication operation is required." });

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
  if (operationId) {
    const applied = await ctx.db.query("narrativeRevisions").withIndex("by_operation", q => q.eq("kind", "writing").eq("operationId", operationId)).first();
    if (applied) {
      if (applied.actorEmail !== actor.email || applied.baseRevision !== expectedRevision || applied.key !== (originalSlug ?? slug) || applied.requestHash !== requestHash) throw new PostgresError({ code: "FIELD_CONFLICT", message: "Operation identity does not match this writing document." });
      const after = applied.after as Doc<"effectIndexArticles">;
      return { slug: after.slug, id: after._id, created: applied.before === null, revision: applied.revision };
    }
  }
  if (intent === "save-unpublished" && (rest.status !== "draft" || (existing !== null && existing.status !== "draft"))) {
    throw new PostgresError({ code: "INVALID_WRITING", message: "An unpublished save requires an explicitly unpublished source and draft result. Publish or unpublish from the tool after review." });
  }
  if (await currentNarrativeRevision(ctx, "writing", existing) !== expectedRevision) throw new PostgresError({ code: "FIELD_CONFLICT", message: "This writing document changed. Reload and reconcile your local edits before publishing." });
  if (existing && rest.bodyFormat !== undefined && rest.bodyFormat !== (existing.bodyFormat ?? "vcode")) throw new PostgresError({ code: "INVALID_WRITING", message: "Writing format cannot be converted by this editor." });
  if (existing && rest.kind !== undefined && rest.kind !== (existing.kind ?? "article")) throw new PostgresError({ code: "INVALID_WRITING", message: "Writing family cannot be changed by this editor." });

  if (renamingFrom) {
    if (!existing) {
      throw new PostgresError({
        code: "ARTICLE_NOT_FOUND",
        message: `No article found for slug "${renamingFrom}".`,
      });
    }
    const taken = await ctx.db
      .query("effectIndexArticles")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .first();
    if (taken) {
      throw new PostgresError({
        code: "SLUG_TAKEN",
        message: `"${slug}" already belongs to "${taken.title}". Choose another slug.`,
      });
    }
  }

  const patch = Object.fromEntries(
    Object.entries(rest).filter(([, value]) => value !== undefined),
  ) as Partial<Doc<"effectIndexArticles">>;

  const status = patch.status ?? existing?.status ?? "published";
  const body = patch.body_raw ?? existing?.body_raw ?? "";
  if (body.length > 400_000 || (patch.title !== undefined && (!patch.title.trim() || patch.title.length > 200)) || (patch.teaser?.length ?? 0) > 500 || (patch.tags?.length ?? 0) > 24 || (patch.authorProfileKeys?.length ?? 0) > 12) throw new PostgresError({ code: "INVALID_WRITING", message: "Writing fields exceed their supported limits." });
  if (patch.coverImageUrl && !/^(https?:\/\/|\/(?!\/))/.test(patch.coverImageUrl)) throw new PostgresError({ code: "INVALID_WRITING", message: "Use an https/http or site-relative cover image URL." });
  if (patch.body_ast !== undefined && patch.body_raw === undefined) throw new PostgresError({ code: "INVALID_WRITING", message: "VCode source is required with its parsed document." });

  if (status === "published" && body.trim() === "") {
    throw new Error("Cannot publish an article with an empty body");
  }
  if ((patch.bodyFormat ?? existing?.bodyFormat ?? "vcode") === "vcode" && patch.body_raw !== undefined) {
    try { patch.body_ast = prepareVCode(body, existing && rest.body_ast === undefined ? { raw: existing.body_raw, ast: existing.body_ast } : undefined); }
    catch (error) { throw new PostgresError({ code: "INVALID_VCODE", message: error instanceof Error ? error.message : "Invalid VCode." }); }
  } else if (patch.bodyFormat === "markdown") {
    patch.body_ast = undefined;
  }

  if (existing) {
    await ctx.db.patch(existing._id, renamingFrom ? { ...patch, slug } : patch);
    const after = (await ctx.db.get(existing._id))!;
    const revision = await recordNarrativeRevision(ctx, { kind: "writing", key: originalSlug ?? slug, operationId, requestHash, baseRevision: expectedRevision, actor, before: existing, after });
    return { slug, created: false, id: existing._id, revision };
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

  const after = (await ctx.db.get(id))!;
  const revision = await recordNarrativeRevision(ctx, { kind: "writing", key: slug, operationId, requestHash, baseRevision: expectedRevision, actor, before: null, after });
  return { slug, created: true, id, revision };
}

export const upsertArticle = mutation({
  args: upsertArticleArgs,
  handler: upsertWritingArticleHandler,
});

export const writingProposalDocumentValidator = v.object({
  slug: v.string(),
  kind: v.union(v.literal("article"), v.literal("blog")),
  status: v.union(v.literal("draft"), v.literal("published")),
  bodyFormat: v.union(v.literal("vcode"), v.literal("markdown")),
  title: v.string(),
  teaser: v.string(),
  coverImageUrl: v.string(),
  body: v.string(),
  tags: v.array(v.string()),
  authorProfileKeys: v.array(v.string()),
  publicationDate: v.optional(v.string()),
});

export type WritingProposalDocument = Infer<typeof writingProposalDocumentValidator>;

export function writingUpsertFields(document: WritingProposalDocument) {
  return {
    slug: document.slug,
    title: document.title,
    kind: document.kind,
    status: document.status,
    publication_status: document.status === "published" ? "published" : "draft",
    bodyFormat: document.bodyFormat,
    body_raw: document.body,
    teaser: document.teaser,
    shortDescription: document.teaser,
    coverImageUrl: document.coverImageUrl,
    tags: document.tags,
    authorProfileKeys: document.authorProfileKeys,
    publicationDate: document.publicationDate,
  };
}

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
    const actor = await requireRole(ctx, { apiKey: args.apiKey, actorEmail: args.actorEmail }, "admin");

    const results = {
      created: 0,
      updated: 0,
      errors: [] as string[],
    };

    for (const article of args.articles) {
        const existing = await ctx.db
          .query("effectIndexArticles")
          .withIndex("by_slug", (q) => q.eq("slug", article.slug))
          .first();

        if (existing) {
          await ctx.db.patch(existing._id, article);
          await recordNarrativeMaintenance(ctx, { kind: "writing", key: article.slug, actor, before: existing, after: (await ctx.db.get(existing._id))! });
          results.updated++;
        } else {
          const id = await ctx.db.insert("effectIndexArticles", article);
          await recordNarrativeMaintenance(ctx, { kind: "writing", key: article.slug, actor, before: null, after: (await ctx.db.get(id))! });
          results.created++;
        }
    }

    return results;
  },
});
