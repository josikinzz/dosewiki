import { PostgresError, v } from "../lib/postgres/runtime/values";
import { query, type MutationCtx } from "../lib/postgres/runtime/server";
import { mutation, internalMutation } from "./lib/indexedMutation";
import { requireRole } from "./lib/auth";
import { contentHash } from "../lib/proposals/contentHash";
import { substanceArticleLightValidator } from "./lib/validators";
import { articleChangePatch, articleConflict, articleDocument, validateArticleChange } from "./lib/articleLifecycleValidation";
import { articleBaseHash, articleRevisionResult, loadArticle, recordArticleRevision } from "./lib/articleRevisionJournal";
import { submitHandler } from "./changeProposals";
import { readProposalTarget } from "./lib/changeProposalTargets";
import type { Id } from "../lib/postgres/runtime/dataModel";
import { projectProposalSummary } from "../lib/proposals/proposalPublic";

const authArgs = { apiKey: v.optional(v.string()), actorEmail: v.optional(v.string()) };
export const get = query({
  args: { ...authArgs, slug: v.string() },
  handler: async (ctx, args) => {
    const actor = await requireRole(ctx, { ...args, adminIntent: "editorArticleWrite" }, "editor");
    const row = await loadArticle(ctx, args.slug);
    const article = articleDocument(row);
    const [draft, history, baseHash, proposalLinks] = await Promise.all([
      ctx.db.query("articleDrafts").withIndex("by_owner_slug", (q) => q.eq("ownerEmail", actor.email).eq("slug", args.slug)).unique(),
      ctx.db.query("articleRevisions").withIndex("by_slug", (q) => q.eq("slug", args.slug)).order("desc").take(4),
      articleBaseHash(ctx, article),
      actor.role === "admin"
        ? ctx.db.query("articleProposalTargets").withIndex("by_slug_created", (q) => q.eq("slug", args.slug)).order("desc").take(4)
        : ctx.db.query("articleProposalTargets").withIndex("by_owner_slug_created", (q) => q.eq("ownerEmail", actor.email).eq("slug", args.slug)).order("desc").take(4),
    ]);
    const proposals = await Promise.all(proposalLinks.map((link) => ctx.db.get(link.proposalId)));
    return {
      article, baseHash,
      draft: draft?.article ? { article: draft.article, baseHash: draft.baseHash, version: draft.version, updatedAt: draft.updatedAt, revisionOf: draft.revisionOf } : null,
      draftVersion: draft?.version ?? 0,
      history: history.map(({ _id, actorEmail, createdAt, before, after, summary, baseHash, resultHash }) => ({ revisionId: _id, actorEmail, createdAt, before, after, summary, baseHash, resultHash })),
      proposals: proposals.filter((proposal) => proposal && (actor.role === "admin" || proposal.proposedBy === actor.email))
        .map((proposal) => projectProposalSummary(proposal!, actor.email)),
    };
  },
});

const actionValidator = v.union(v.literal("saveDraft"), v.literal("discardDraft"), v.literal("publish"), v.literal("submit"), v.literal("restore"));
const writeArgs = {
  ...authArgs, action: actionValidator, slug: v.string(), baseHash: v.string(), changeId: v.string(),
  article: v.optional(substanceArticleLightValidator), summary: v.optional(v.string()),
  revisionId: v.optional(v.id("articleRevisions")), revisionOf: v.optional(v.id("changeProposals")), draftVersion: v.optional(v.number()),
};
type WriteArgs = {
  apiKey?: string; actorEmail?: string; action: "saveDraft" | "discardDraft" | "publish" | "submit" | "restore";
  slug: string; baseHash: string; changeId: string; article?: { id: number | null; title: string; slug?: string } & Record<string, unknown>;
  summary?: string; revisionId?: Id<"articleRevisions">; revisionOf?: Id<"changeProposals">; draftVersion?: number;
};

export async function writeHandler(ctx: MutationCtx, args: WriteArgs) {
  const actor = await requireRole(ctx, { apiKey: args.apiKey, actorEmail: args.actorEmail, adminIntent: "editorArticleWrite" }, args.action === "publish" || args.action === "restore" ? "admin" : "editor");
  if (args.action === "publish" && args.revisionOf) throw new PostgresError({ code: "PROPOSAL_SELF_APPROVAL", message: "Changes linked to a proposal must use its independent review workflow." });
  if (!/^[A-Za-z0-9][A-Za-z0-9:_-]{7,159}$/.test(args.changeId)) throw new PostgresError({ code: "ARTICLE_CHANGE_ID", message: "Supply one stable change ID for this operation and retain it when retrying." });
  const { apiKey: _secret, actorEmail: _email, ...request } = args;
  const fingerprint = contentHash(request);
  const receipt = await ctx.db.query("articleDraftReceipts").withIndex("by_owner_change", (q) => q.eq("ownerEmail", actor.email).eq("changeId", args.changeId)).unique();
  if (receipt) {
    if (receipt.fingerprint !== fingerprint) throw new PostgresError({ code: "ARTICLE_CHANGE_REUSED", message: "This change ID was used for different content. Keep the original request when retrying." });
    if (receipt.result.revisionId) {
      const revision = await ctx.db.get(receipt.result.revisionId as Id<"articleRevisions">);
      if (!revision) throw new PostgresError({ code: "ARTICLE_REVISION_MISSING", message: "The committed revision is unavailable." });
      return { ...articleRevisionResult(revision), draftVersion: receipt.result.draftVersion };
    }
    return receipt.result;
  }
  const row = await loadArticle(ctx, args.slug);
  const before = articleDocument(row);
  const baseHash = await articleBaseHash(ctx, before);
  const draft = await ctx.db.query("articleDrafts").withIndex("by_owner_slug", (q) => q.eq("ownerEmail", actor.email).eq("slug", args.slug)).unique();
  const checkDraftVersion = () => {
    if ((args.draftVersion ?? 0) !== (draft?.version ?? 0)) articleConflict("Your private draft changed in another tab. Reload the saved draft before saving or discarding it.");
  };
  let result: Record<string, unknown>;
  if (args.action === "discardDraft") {
    checkDraftVersion();
    const draftVersion = draft ? draft.version + 1 : 0;
    if (draft) await ctx.db.patch(draft._id, { article: undefined, revisionOf: undefined, version: draftVersion, updatedAt: new Date().toISOString() });
    result = { discarded: true, draft: null, draftVersion, baseHash, changeId: args.changeId };
  } else if (args.action === "saveDraft") {
    checkDraftVersion();
    // A stale public baseline may still be saved privately; it cannot be submitted
    // or published until explicitly reconciled. Saving never rebases it silently.
    const article = validateArticleChange(before, args.article, false);
    const version = (draft?.version ?? 0) + 1;
    const document = { slug: args.slug, ownerEmail: actor.email, article, baseHash: args.baseHash, version, updatedAt: new Date().toISOString(), ...(args.revisionOf ? { revisionOf: args.revisionOf } : {}) };
    if (draft) await ctx.db.replace(draft._id, document); else await ctx.db.insert("articleDrafts", document);
    result = { draft: { version, baseHash: args.baseHash }, draftVersion: version, baseHash: args.baseHash, changeId: args.changeId };
  } else {
    if (args.baseHash !== baseHash) articleConflict();
    const summary = args.summary?.trim() ?? "";
    if (!summary || summary.length > 500) throw new PostgresError({ code: "ARTICLE_SUMMARY_REQUIRED", message: "Describe this change in 1–500 characters." });
    let proposed = args.article;
    if (args.action === "restore") {
      if (!args.revisionId) throw new PostgresError({ code: "ARTICLE_REVISION_REQUIRED", message: "Choose the revision to restore." });
      const revision = await ctx.db.get(args.revisionId);
      if (!revision || revision.slug !== args.slug) throw new PostgresError({ code: "ARTICLE_REVISION_MISMATCH", message: "This revision does not belong to this article." });
      if (revision.resultHash !== baseHash) articleConflict("Newer work follows this revision. Its inverse cannot overwrite that work; open a fresh edit and reconcile the desired fields instead.");
      proposed = revision.before;
    }
    const article = validateArticleChange(before, proposed, true, args.action === "restore");
    if (contentHash(article) === contentHash(before)) throw new PostgresError({ code: "ARTICLE_UNCHANGED", message: "No article content changed." });
    if (args.action === "submit") {
      const proposal = await submitHandler(ctx, {
        apiKey: args.apiKey, actorEmail: args.actorEmail, payload: { articles: [article] }, summary,
        baselines: [{ kind: "article", key: args.slug, document: await readProposalTarget(ctx, { kind: "article", key: args.slug }) }],
        ...(args.revisionOf ? { revisionOf: args.revisionOf } : {}),
      });
      result = { ...proposal, status: "submitted", changeId: args.changeId, baseHash };
    } else {
      // Changed units replace exactly; unrelated sections never enter the patch.
      // Reference metadata is not merged over the correction or guarded inverse.
      await ctx.db.patch(row._id, articleChangePatch(before, article));
      result = await recordArticleRevision(ctx, {
        before, after: article, actor, changeId: args.changeId, baseHash, summary,
        ...(args.action === "restore" ? { restoredFrom: args.revisionId } : {}),
      });
    }
    // Never erase a newer draft saved by a concurrent tab.
    let draftVersion = draft?.version ?? 0;
    if (draft?.article && args.draftVersion === draft.version) {
      draftVersion += 1;
      await ctx.db.patch(draft._id, { article: undefined, revisionOf: undefined, version: draftVersion, updatedAt: new Date().toISOString() });
    }
    result.draftVersion = draftVersion;
  }
  const receiptResult = "revisionId" in result ? { revisionId: result.revisionId, draftVersion: result.draftVersion } : result;
  await ctx.db.insert("articleDraftReceipts", { ownerEmail: actor.email, changeId: args.changeId, fingerprint, result: receiptResult });
  return result;
}
export const write = mutation({ args: writeArgs, handler: writeHandler });

/** Deployment-owned, cursor-bounded producer for pre-contextual proposals.
 * Never called by reader/editor page requests; run explicitly during rollout.
 */
export const backfillArticleProposalTargets = internalMutation({
  args: { cursor: v.optional(v.union(v.string(), v.null())) },
  handler: async (ctx, args) => {
    const page = await ctx.db.query("changeProposals").withIndex("by_created_at").paginate({ cursor: args.cursor ?? null, numItems: 8 });
    for (const proposal of page.page) {
      for (const target of proposal.targets) {
        if (target.kind !== "article") continue;
        const existing = await ctx.db.query("articleProposalTargets").withIndex("by_proposal_slug", (q) => q.eq("proposalId", proposal._id).eq("slug", target.key)).unique();
        if (!existing) await ctx.db.insert("articleProposalTargets", { proposalId: proposal._id, ownerEmail: proposal.proposedBy, slug: target.key, createdAt: proposal.createdAt });
      }
    }
    return { cursor: page.continueCursor, isDone: page.isDone };
  },
});
