import { mutation } from "./lib/indexedMutation";
import { PostgresError, v } from "../lib/postgres/runtime/values";
import { indexLayoutValidator, substanceArticleLightValidator } from "./lib/validators";
import { requireRole } from "./lib/auth";
import { assertDataWritesNotFrozen } from "../lib/runtime/dataWriteFreeze";
import { contentHash } from "../lib/proposals/contentHash";
import { writeArticle, requireArticleChangeId } from "./lib/articleWrite";
import { saveIndexLayoutHandler } from "./indexLayouts";
import { deriveSubmittedBy } from "../lib/changelog/submitterStamp";
import type { SubstanceIngestionOutcome } from "./lib/substanceIngestion";

export const ARTICLE_BATCH_VERSION = 1;
export function batchChildId(owner: string, operationId: string, kind: "article" | "layout", key: string): string {
  return `batch-${kind}-${contentHash({ version: ARTICLE_BATCH_VERSION, owner, operationId, kind, key })}`;
}

/** One actor operation commits articles, layouts, history, indexes and outbox atomically. */
export const save = mutation({
  args: {
    apiKey: v.optional(v.string()), actorEmail: v.string(), operationId: v.string(),
    articles: v.array(v.union(
      v.object({ kind: v.literal("replace-existing"), baseHash: v.string(), article: substanceArticleLightValidator }),
      v.object({ kind: v.literal("create"), article: substanceArticleLightValidator }),
    )),
    indexLayouts: v.array(v.object({
      ...indexLayoutValidator.fields, expected: v.any(), expectedRevision: v.number(),
    })),
    changelog: v.optional(v.object({
      markdown: v.string(), articles: v.array(v.object({ id: v.number(), title: v.string(), slug: v.string() })),
    })),
  },
  handler: async (ctx, args) => {
    assertDataWritesNotFrozen("saveArticleBatch:save");
    if (!args.actorEmail.trim()) throw new PostgresError({ code: "ACTOR_REQUIRED", message: "A signed-in member is required to publish a staged batch." });
    const actor = await requireRole(ctx, { apiKey: args.apiKey, actorEmail: args.actorEmail, adminIntent: "editorArticleWrite" }, "admin");
    requireArticleChangeId(args.operationId);
    const fingerprint = contentHash({ version: ARTICLE_BATCH_VERSION, articles: args.articles, indexLayouts: args.indexLayouts, changelog: args.changelog ?? null });
    const previous = await ctx.db.query("articleBatchReceipts").withIndex("by_owner_operation", q => q.eq("ownerEmail", actor.email).eq("operationId", args.operationId)).unique();
    if (previous) {
      if (previous.fingerprintVersion !== ARTICLE_BATCH_VERSION || previous.fingerprint !== fingerprint) {
        throw new PostgresError({ code: "ARTICLE_BATCH_REUSED", message: "This batch ID already names different changes. Retry its original request before publishing newer edits." });
      }
      if (previous.resultVersion !== ARTICLE_BATCH_VERSION) throw new PostgresError({ code: "ARTICLE_BATCH_VERSION", message: "This saved batch receipt needs a supported reader." });
      return previous.result;
    }
    const slugs = args.articles.map(command => command.article.slug);
    if (slugs.some(slug => !slug) || new Set(slugs).size !== slugs.length || new Set(args.indexLayouts.map(layout => layout.type)).size !== args.indexLayouts.length) {
      throw new PostgresError({ code: "ARTICLE_BATCH_TARGETS", message: "Every batch target must have one unique identity." });
    }
    const outcomes: SubstanceIngestionOutcome[] = [];
    const articleReceipts: Array<{ slug: string; baseHash: string; unchanged: boolean; changeId: string; revisionId: string | null }> = [];
    for (const command of args.articles) {
      const result = await writeArticle(ctx, actor, command, {
        changeId: batchChildId(actor.email, args.operationId, "article", command.article.slug!),
        summary: "Published staged article changes", publicChangelog: false,
      });
      outcomes.push(result.outcome);
      articleReceipts.push({ slug: command.article.slug!, baseHash: result.baseHash, unchanged: result.unchanged, changeId: result.changeId, revisionId: result.revisionId });
    }
    const layoutResults: Array<{ type: (typeof args.indexLayouts)[number]["type"]; operationId: string; receipt: Awaited<ReturnType<typeof saveIndexLayoutHandler>> }> = [];
    for (const layout of args.indexLayouts) {
      const operationId = batchChildId(actor.email, args.operationId, "layout", layout.type);
      const receipt = await saveIndexLayoutHandler(ctx, {
        ...layout, apiKey: args.apiKey, actorEmail: actor.email,
        operationId,
      });
      layoutResults.push({ type: layout.type, operationId, receipt });
    }
    const articleResult = {
      created: outcomes.filter(outcome => outcome.action === "created").length,
      updated: outcomes.filter(outcome => outcome.action === "updated").length,
      skipped: outcomes.filter(outcome => outcome.action === "skipped").length,
      errors: [] as string[], outcomes,
      affectedPaths: [...new Set(outcomes.flatMap(outcome => outcome.affectedPaths))],
    };
    const now = new Date().toISOString();
    const changelog = articleResult.created + articleResult.updated > 0 && args.changelog ? {
      ...args.changelog, entryId: `batch-${contentHash({ owner: actor.email, operationId: args.operationId })}`,
      createdAt: now, message: "Dev editor update", submittedBy: deriveSubmittedBy(actor.email),
    } : null;
    if (changelog) await ctx.db.insert("changelog", changelog);
    const result = { version: ARTICLE_BATCH_VERSION, operationId: args.operationId, fingerprint, articleResult, articleReceipts, layoutResults, changelogSaved: changelog !== null, changelog };
    await ctx.db.insert("articleBatchReceipts", {
      ownerEmail: actor.email, operationId: args.operationId, fingerprintVersion: ARTICLE_BATCH_VERSION,
      fingerprint, resultVersion: ARTICLE_BATCH_VERSION, result,
    });
    return result;
  },
});
