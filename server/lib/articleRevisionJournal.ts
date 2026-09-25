import { PostgresError } from "../../lib/postgres/runtime/values"
import type { Doc, Id } from "../../lib/postgres/runtime/dataModel"
import type { MutationCtx, QueryCtx } from "../../lib/postgres/runtime/server"
import type { AuthorizedActor } from "./auth";
import { contentHash } from "../../lib/proposals/contentHash";
import { deriveSubmittedBy } from "../../lib/changelog/submitterStamp";
import { articleChangePatch, articleDocument, type ArticleDocument } from "./articleLifecycleValidation";
import { articleContentFingerprint, articleFingerprintOf, articleReviewRevision } from "./articleReviewRevision";
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
  /** False only for a snapshot of content another write already stored. */
  markEvidence?: boolean;
}) {
  const now = new Date().toISOString();
  const changed = Object.keys(articleChangePatch(input.before, input.after));
  if (input.markEvidence !== false) await markChangedArticleEvidence(ctx, input.before, input.after, input.actor.email, changed);
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

async function moleculeChemistry(ctx: QueryCtx | MutationCtx, slug: string) {
  return ctx.db.query("moleculeOverrides").withIndex("by_slug", (q) => q.eq("slug", slug)).first();
}

/**
 * The article's current published revision, as a review sign-off records it:
 * derived from the stored article and its molecule override (see
 * `articleReviewRevision`), so a write that bypasses the revision journal
 * still moves it and makes an earlier sign-off stale.
 */
export async function publishedArticleRevision(ctx: QueryCtx | MutationCtx, slug: string): Promise<string> {
  const article = await loadArticle(ctx, slug);
  return articleReviewRevision(articleDocument(article), await moleculeChemistry(ctx, slug));
}

async function articleRevisionsOldestFirst(ctx: QueryCtx | MutationCtx, slug: string) {
  const revisions = await ctx.db.query("articleRevisions").withIndex("by_slug", (q) => q.eq("slug", slug)).order("asc").take(REVIEW_REVISION_SCAN_LIMIT + 1);
  if (revisions.length > REVIEW_REVISION_SCAN_LIMIT) {
    throw new PostgresError({ code: "ARTICLE_REVISION_LIMIT", message: "This article has too many revisions to locate a review sign-off." });
  }
  return revisions;
}

/**
 * Make sure the revision journal holds the article exactly as stored, so the
 * content a sign-off or recommendation covers can be read back later. When a
 * write bypassed the journal, one private snapshot row records the stored
 * content (against the last journaled state) without touching citation
 * evidence or the public changelog.
 */
export async function journalStoredArticle(ctx: MutationCtx, slug: string, actor: Pick<AuthorizedActor, "email" | "role">) {
  const current = articleDocument(await loadArticle(ctx, slug));
  const latest = await ctx.db.query("articleRevisions").withIndex("by_slug", (q) => q.eq("slug", slug)).order("desc").first();
  const fingerprint = articleContentFingerprint(current);
  if (latest && articleContentFingerprint(latest.after as ArticleDocument) === fingerprint) return;
  await recordArticleRevision(ctx, {
    before: (latest?.after as ArticleDocument | undefined) ?? current,
    after: current,
    actor,
    changeId: `review-snapshot-${Date.now().toString(36)}-${fingerprint.slice(0, 12)}`,
    baseHash: await articleBaseHash(ctx, current),
    summary: "Recorded the stored article for a review",
    publicChangelog: false,
    markEvidence: false,
  });
}

/**
 * The article as it stood at a signed revision, or null when the revision
 * names no state of this article that can be read back. A derived revision is
 * found by content: the stored article, then journaled states newest first.
 * A legacy journal `resultHash` names its row, and the legacy
 * `REVIEW_INITIAL_REVISION` marker the first revision's `before` (the current
 * article when nothing was ever journaled).
 */
export async function articleAtRevision(
  ctx: QueryCtx | MutationCtx,
  slug: string,
  revision: string,
  current: ArticleDocument,
): Promise<ArticleDocument | null> {
  const revisions = await articleRevisionsOldestFirst(ctx, slug);
  if (revision === REVIEW_INITIAL_REVISION) return (revisions[0]?.before as ArticleDocument | undefined) ?? current;
  const fingerprint = articleFingerprintOf(revision);
  if (fingerprint === null) {
    const signed = revisions.find((row) => row.resultHash === revision);
    return signed ? (signed.after as ArticleDocument) : null;
  }
  if (articleContentFingerprint(current) === fingerprint) return current;
  for (let index = revisions.length - 1; index >= 0; index -= 1) {
    const after = revisions[index].after as ArticleDocument;
    if (articleContentFingerprint(after) === fingerprint) return after;
  }
  const first = revisions[0]?.before as ArticleDocument | undefined;
  return first && articleContentFingerprint(first) === fingerprint ? first : null;
}

/** Whether `revision` names a state of this article that a review can cover. */
export async function isArticleRevision(ctx: QueryCtx | MutationCtx, slug: string, revision: string): Promise<boolean> {
  const current = articleDocument(await loadArticle(ctx, slug));
  return (await articleAtRevision(ctx, slug, revision, current)) !== null;
}
