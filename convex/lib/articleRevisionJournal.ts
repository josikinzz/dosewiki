import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { AuthorizedActor } from "./auth";
import { contentHash } from "../../lib/proposals/contentHash";
import { deriveSubmittedBy } from "../../lib/changelog/submitterStamp";
import { articleChangePatch, type ArticleDocument } from "./articleLifecycleValidation";

export async function loadArticle(ctx: QueryCtx | MutationCtx, slug: string) {
  const rows = await ctx.db.query("substanceIndex").withIndex("by_slug", (q) => q.eq("slug", slug)).take(2);
  if (rows.length !== 1) throw new ConvexError({ code: "ARTICLE_NOT_FOUND", message: "The article is missing or its slug is ambiguous." });
  return rows[0];
}

export async function articleBaseHash(ctx: QueryCtx | MutationCtx, article: ArticleDocument): Promise<string> {
  const latest = await ctx.db.query("articleRevisions").withIndex("by_slug", (q) => q.eq("slug", article.slug!)).order("desc").first();
  return contentHash({ article, revision: latest?._id ?? null });
}

/** Source quotes and research never leave citationEvidence. Old support is retained
 * for audit but explicitly decertified when its owning section or source changes.
 */
async function markChangedArticleEvidence(ctx: MutationCtx, after: ArticleDocument, actorEmail: string, changedSections: string[]) {
  if (!changedSections.length) return;
  const referencesChanged = changedSections.includes("references");
  const evidence = await ctx.db.query("citationEvidence").withIndex("by_slug", (q) => q.eq("slug", after.slug!)).take(1001);
  if (evidence.length > 1000) throw new ConvexError({ code: "ARTICLE_EVIDENCE_LIMIT", message: "This article has too much evidence for one atomic edit. Use the citation workbench to split its evidence first." });
  for (const row of evidence) {
    const section = row.fieldPath?.split(/[.[]/, 1)[0] ?? row.section;
    if (!referencesChanged && !changedSections.includes(section)) continue;
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
  await markChangedArticleEvidence(ctx, input.after, input.actor.email, changed);
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
