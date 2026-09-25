import { PostgresError } from "../../lib/postgres/runtime/values"
import type { Doc, Id } from "../../lib/postgres/runtime/dataModel"
import type { MutationCtx, QueryCtx } from "../../lib/postgres/runtime/server"
import type { AuthorizedActor } from "./auth";
import { contentHash } from "../../lib/proposals/contentHash";
import { deriveSubmittedBy } from "../../lib/changelog/submitterStamp";
import { articleChangePatch, type ArticleDocument } from "./articleLifecycleValidation";
import { encodeFieldPathKey, getArticleValueByPath } from "../../src/data/schema/fieldPath";
import { REVIEW_INITIAL_REVISION } from "../../src/schema/substance/editorial";

export async function loadArticle(ctx: QueryCtx | MutationCtx, slug: string) {
  const rows = await ctx.db.query("substanceIndex").withIndex("by_slug", (q) => q.eq("slug", slug)).take(2);
  if (rows.length !== 1) throw new PostgresError({ code: "ARTICLE_NOT_FOUND", message: "The article is missing or its slug is ambiguous." });
  return rows[0];
}

export async function articleBaseHash(ctx: QueryCtx | MutationCtx, article: ArticleDocument): Promise<string> {
  const latest = await ctx.db.query("articleRevisions").withIndex("by_slug", (q) => q.eq("slug", article.slug!)).order("desc").first();
  return contentHash({ article, revision: latest?._id ?? null });
}

/** Source quotes and research never leave citationEvidence. Old support is retained
 * for audit but explicitly decertified when its owning section or source changes.
 */
async function markChangedArticleEvidence(ctx: MutationCtx, before: ArticleDocument, after: ArticleDocument, actorEmail: string, changedSections: string[]) {
  if (!changedSections.length) return;
  const referencesChanged = changedSections.includes("references");
  const changedReferenceIds = referencesChanged ? new Set<string>() : null;
  if (changedReferenceIds) {
    const beforeById = new Map<string, unknown[]>();
    const afterById = new Map<string, unknown[]>();
    for (const reference of before.references ?? []) {
      const group = beforeById.get(reference.id);
      if (group) group.push(reference);
      else beforeById.set(reference.id, [reference]);
    }
    for (const reference of after.references ?? []) {
      const group = afterById.get(reference.id);
      if (group) group.push(reference);
      else afterById.set(reference.id, [reference]);
    }
    for (const [id, references] of beforeById) {
      const current = afterById.get(id);
      if (!current || contentHash(references) !== contentHash(current)) changedReferenceIds.add(id);
    }
    for (const id of afterById.keys()) {
      if (!beforeById.has(id)) changedReferenceIds.add(id);
    }
  }
  const evidence = await ctx.db.query("citationEvidence").withIndex("by_slug", (q) => q.eq("slug", after.slug!)).take(1001);
  if (evidence.length > 1000) throw new PostgresError({ code: "ARTICLE_EVIDENCE_LIMIT", message: "This article has too much evidence for one atomic edit. Use the citation workbench to split its evidence first." });
  for (const row of evidence) {
    const section = row.fieldPath?.split(/[.[]/, 1)[0] ?? row.section;
    let fieldChanged = section !== "references" && changedSections.includes(section);
    if (fieldChanged && row.fieldPath) {
      let beforeValue = getArticleValueByPath(before, row.fieldPath);
      let afterValue = getArticleValueByPath(after, row.fieldPath);
      if (beforeValue === undefined && afterValue === undefined) {
        const legacyPath = row.fieldPath.split(".").map(encodeFieldPathKey).join(".");
        beforeValue = getArticleValueByPath(before, legacyPath);
        afterValue = getArticleValueByPath(after, legacyPath);
      }
      if (beforeValue !== undefined || afterValue !== undefined) {
        fieldChanged = beforeValue !== afterValue && contentHash({ value: beforeValue }) !== contentHash({ value: afterValue });
      }
    }
    if (!fieldChanged && (!changedReferenceIds || !row.referenceIds.some((id) => changedReferenceIds.has(id)))) continue;
    await ctx.db.patch(row._id, {
      status: "needs_review", entailmentVerdict: "uncertain", strictReviewEvidence: undefined,
      statusReason: "Article content or reference metadata changed; retained support must be rechecked against this revision.",
      updatedBy: actorEmail, updatedAt: new Date().toISOString(),
    });
  }
}

export async function recordArticleRevision(ctx: MutationCtx, input: {
  before: ArticleDocument; after: ArticleDocument; actor: Pick<AuthorizedActor, "email" | "role">;
  changeId: string; baseHash: string; summary: string; restoredFrom?: Id<"articleRevisions">; publicChangelog?: boolean;
}) {
  const now = new Date().toISOString();
  const changed = Object.keys(articleChangePatch(input.before, input.after));
  await markChangedArticleEvidence(ctx, input.before, input.after, input.actor.email, changed);
  const revisionId = await ctx.db.insert("articleRevisions", {
    slug: input.after.slug!, changeId: input.changeId, actorEmail: input.actor.email, actorRole: input.actor.role,
    before: input.before, after: input.after, baseHash: input.baseHash, resultHash: "", summary: input.summary,
    createdAt: now, ...(input.restoredFrom ? { restoredFrom: input.restoredFrom } : {}),
  });
  const resultHash = contentHash({ article: input.after, revision: revisionId });
  await ctx.db.patch(revisionId, { resultHash });
  if (input.publicChangelog !== false) {
    // Public history names changed sections, never dumps internal review/reference provenance.
    await ctx.db.insert("changelog", {
      entryId: `article-${revisionId}`, createdAt: now, message: input.summary,
      markdown: `Changed ${changed.join(", ")} on ${input.after.title}.`,
      submittedBy: deriveSubmittedBy(input.actor.email),
      articles: [{ id: input.after.id ?? 0, title: input.after.title, slug: input.after.slug! }],
    });
  }
  return { revisionId, article: input.after, baseHash: resultHash, changeId: input.changeId };
}

export function articleRevisionResult(revision: Doc<"articleRevisions">) {
  return { revisionId: revision._id, article: revision.after, baseHash: revision.resultHash, changeId: revision.changeId };
}

/** Revisions one article may carry before review lookups refuse to guess. */
const REVIEW_REVISION_SCAN_LIMIT = 1000;

/**
 * The article's current published revision, as a review sign-off records it:
 * the latest revision's `resultHash`, or `REVIEW_INITIAL_REVISION` when no
 * revision has been recorded yet.
 */
export async function publishedArticleRevision(ctx: QueryCtx | MutationCtx, slug: string): Promise<string> {
  const latest = await ctx.db.query("articleRevisions").withIndex("by_slug", (q) => q.eq("slug", slug)).order("desc").first();
  return latest?.resultHash || REVIEW_INITIAL_REVISION;
}

async function articleRevisionsOldestFirst(ctx: QueryCtx | MutationCtx, slug: string) {
  const revisions = await ctx.db.query("articleRevisions").withIndex("by_slug", (q) => q.eq("slug", slug)).order("asc").take(REVIEW_REVISION_SCAN_LIMIT + 1);
  if (revisions.length > REVIEW_REVISION_SCAN_LIMIT) {
    throw new PostgresError({ code: "ARTICLE_REVISION_LIMIT", message: "This article has too many revisions to locate a review sign-off." });
  }
  return revisions;
}

/** Whether `revision` names a published state of this article that a review can cover. */
export async function isArticleRevision(ctx: QueryCtx | MutationCtx, slug: string, revision: string): Promise<boolean> {
  if (revision === REVIEW_INITIAL_REVISION) return true;
  const revisions = await articleRevisionsOldestFirst(ctx, slug);
  return revisions.some((row) => row.resultHash === revision);
}

/**
 * The article as it stood at a signed revision: that revision's `after`, or
 * for `REVIEW_INITIAL_REVISION` the first revision's `before` (the current
 * article when nothing was ever published). Null when the revision is unknown
 * for this slug.
 */
export async function articleAtRevision(
  ctx: QueryCtx | MutationCtx,
  slug: string,
  revision: string,
  current: ArticleDocument,
): Promise<ArticleDocument | null> {
  const revisions = await articleRevisionsOldestFirst(ctx, slug);
  if (revision === REVIEW_INITIAL_REVISION) return (revisions[0]?.before as ArticleDocument | undefined) ?? current;
  const signed = revisions.find((row) => row.resultHash === revision);
  return signed ? (signed.after as ArticleDocument) : null;
}
