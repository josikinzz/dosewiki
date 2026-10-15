import { PostgresError } from "../../lib/postgres/runtime/values";
import type { MutationCtx } from "../../lib/postgres/runtime/server";
import type { Doc, Id } from "../../lib/postgres/runtime/dataModel";
import type { AuthorizedActor } from "./auth";
import { assertDataWritesNotFrozen } from "../../lib/runtime/dataWriteFreeze";
import { contentHash } from "../../lib/proposals/contentHash";
import { articleChangePatch, articleConflict, articleDocument, validateArticleChange } from "./articleLifecycleValidation";
import { articleBaseHash, loadArticle, recordArticleRevision } from "./articleRevisionJournal";
import { ingestSubstanceArticle, type SubstanceIngestionOutcome, toSubstanceSnapshot } from "./substanceIngestion";
import { projectPublicArticle } from "../../src/data/projections/substanceReadProjections";
import { classifySubstancePublicationDependency } from "../../src/data/projections/substancePublicationDependencies";

type Actor = Pick<AuthorizedActor, "email" | "role">;
type RevisionInput = Parameters<typeof recordArticleRevision>[1];
type ArticleInput = { id: number | null; title: string; slug?: string } & Record<string, unknown>;

export function requireArticleChangeId(changeId: string): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9:_-]{7,159}$/.test(changeId)) {
    throw new PostgresError({ code: "ARTICLE_CHANGE_ID", message: "Supply one stable change ID for this operation and retain it when retrying." });
  }
}

/** The accepted patch and journal always commit together, including evidence invalidation. */
export async function commitArticleChange(ctx: MutationCtx, input: RevisionInput & { row: Doc<"substanceIndex"> }) {
  assertDataWritesNotFrozen("articleWrite:commit");
  if (await articleBaseHash(ctx, articleDocument(input.row)) !== input.baseHash) articleConflict();
  await ctx.db.patch(input.row._id, articleChangePatch(input.before, input.after));
  return recordArticleRevision(ctx, input);
}

export type ArticleCommand =
  | { kind: "replace-existing"; article: ArticleInput; baseHash: string }
  | { kind: "create"; article: ArticleInput };

/** Authenticated callers supply actor authority; this owner controls revision, replay and storage. */
export async function writeArticle(ctx: MutationCtx, actor: Actor, command: ArticleCommand, options: {
  changeId: string; summary: string; publicChangelog: boolean; restoring?: boolean;
}): Promise<{ outcome: SubstanceIngestionOutcome; baseHash: string; unchanged: boolean; changeId: string; revisionId: Id<"articleRevisions"> | null }> {
  assertDataWritesNotFrozen("articleWrite:write");
  requireArticleChangeId(options.changeId);
  if (command.kind === "create") {
    const slug = command.article.slug?.trim();
    if (!slug) throw new PostgresError({ code: "ARTICLE_INVALID", message: "A new article requires an explicit slug." });
    const bySlug = await ctx.db.query("substanceIndex").withIndex("by_slug", q => q.eq("slug", slug)).first();
    const byId = command.article.id === null ? null : await ctx.db.query("substanceIndex").withIndex("by_article_id", q => q.eq("id", command.article.id)).first();
    if (bySlug || byId) throw new PostgresError({ code: "ARTICLE_CREATE_EXISTS", message: "The new article's slug or ID already exists. Reload before creating it." });
    const outcome = await ingestSubstanceArticle({ db: ctx.db, article: command.article });
    if (outcome.action !== "created") throw new PostgresError({ code: "ARTICLE_INVALID", message: outcome.error ?? "The new article could not be created." });
    const stored = articleDocument(await loadArticle(ctx, slug));
    return { outcome, baseHash: await articleBaseHash(ctx, stored), unchanged: false, changeId: options.changeId, revisionId: null };
  }
  const slug = command.article.slug;
  if (!slug || !command.baseHash) throw new PostgresError({ code: "ARTICLE_BASELINE_REQUIRED", message: "Load the complete article and its revision before publishing. Your draft is preserved." });
  const fingerprint = contentHash({ command, ...options });
  const prior = await ctx.db.query("articleDraftReceipts").withIndex("by_owner_change", q => q.eq("ownerEmail", actor.email).eq("changeId", options.changeId)).unique();
  if (prior) {
    if (prior.fingerprint !== fingerprint) throw new PostgresError({ code: "ARTICLE_CHANGE_REUSED", message: "That change ID already names another edit." });
    return prior.result;
  }
  const row = await loadArticle(ctx, slug);
  const before = articleDocument(row);
  if (command.baseHash !== await articleBaseHash(ctx, before)) articleConflict();
  const after = validateArticleChange(before, { ...command.article, section_gaps: before.section_gaps }, true, options.restoring);
  const unchanged = contentHash(before) === contentHash(after);
  const revision = unchanged ? null : await commitArticleChange(ctx, {
    row, before, after, actor, baseHash: command.baseHash, ...options,
  });
  const outcome: SubstanceIngestionOutcome = {
    target: before.id === null ? `slug:${slug}` : `id:${before.id}`,
    action: unchanged ? "skipped" : "updated", dataId: row._id, articleId: after.id,
    title: after.title, requestedSlug: slug, fallbackSlug: slug, canonicalSlug: slug,
    previous: toSubstanceSnapshot(before), next: toSubstanceSnapshot(after), validationErrors: [], error: null,
    affectedPaths: unchanged ? [] : [`/${slug}`, "/substances"],
    ...(unchanged ? {} : { publicRevision: projectPublicArticle(after).publicRevision, publicationDependency: classifySubstancePublicationDependency(before, after) }),
  };
  const result = { outcome, baseHash: revision?.baseHash ?? command.baseHash, unchanged, changeId: options.changeId, revisionId: revision?.revisionId ?? null };
  await ctx.db.insert("articleDraftReceipts", { ownerEmail: actor.email, changeId: options.changeId, fingerprint, result });
  return result;
}
