import { PostgresError, v } from "../lib/postgres/runtime/values";
import { query, type MutationCtx, type QueryCtx } from "../lib/postgres/runtime/server";
import { mutation } from "./lib/indexedMutation";
import type { Doc, Id } from "../lib/postgres/runtime/dataModel";
import { canTransition, type ProposalStatus } from "../lib/proposals/proposalStatus";
import { contentHash } from "../lib/proposals/contentHash";
import { proposalComparableDocument, type ProposalBaseline } from "../lib/proposals/proposalBaseline";
import { buildArticlePatches, buildProposalDiff } from "./lib/changeProposalDiff";
import { readArticlePatches, type ArticlePatch } from "../lib/proposals/articlePatch";
import type { ProposalPayload, ProposalSnapshotEntry } from "./lib/changeProposalApply";
import { requireRole } from "./lib/auth";
import { clearInboxClaim } from "./lib/inboxClaimSources";
import { deriveProposalTargets, proposalHashDocument, readProposalTarget } from "./lib/changeProposalTargets";
import {
  indexLayoutValidator,
  substanceArticleLightValidator,
  validateArticleForIngestion,
} from "./lib/validators";
import { copyBlockDocumentValidator, type CopyBlockDocument } from "./copyBlocks";
import { changeProposalStatusValidator } from "./lib/accessSchemaValidators";
import { aboutDocumentValidator, type AboutDocument } from "./siteConfig";
import { writingProposalDocumentValidator, type WritingProposalDocument } from "./effectIndexArticles";
import { prepareVCode } from "../src/features/effects/vcode/editing";
import { projectProposalComment, projectProposalDetail, projectProposalSummary } from "../lib/proposals/proposalPublic";
import { articleDocument, validateArticleChange } from "./lib/articleLifecycleValidation";
import { readFeedbackRef, type FeedbackRef } from "../src/features/intake/feedbackCorrection";

export const changeProposalPayloadValidator = v.object({
  articles: v.optional(v.array(substanceArticleLightValidator)),
  indexLayouts: v.optional(v.array(indexLayoutValidator)),
  copyBlocks: v.optional(v.array(copyBlockDocumentValidator)),
  about: v.optional(aboutDocumentValidator),
  writing: v.optional(writingProposalDocumentValidator),
  changelog: v.optional(
    v.object({
      markdown: v.string(),
      articles: v.array(v.object({ id: v.number(), title: v.string(), slug: v.string() })),
    }),
  ),
});

type SubmitArgs = {
  apiKey?: string;
  actorEmail?: string;
  payload: {
    articles?: Array<{ id: number | null; title: string; slug?: string } & Record<string, unknown>>;
    indexLayouts?: Array<{ type: "psychoactive" | "chemical" | "mechanism" } & Record<string, unknown>>;
    copyBlocks?: CopyBlockDocument[];
    about?: AboutDocument;
    writing?: WritingProposalDocument;
    changelog?: { markdown: string; articles: Array<{ id: number; title: string; slug: string }> };
  };
  summary: string;
  baselines: ProposalBaseline[];
  revisionOf?: Id<"changeProposals">;
  feedbackRef?: FeedbackRef;
};

const SUMMARY_MAX_LENGTH = 500;

const REVISABLE_STATUSES: readonly ProposalStatus[] = ["submitted", "changes_requested"];

async function validateWritingProposal(ctx: MutationCtx, writing: WritingProposalDocument) {
  const stored = await ctx.db
    .query("effectIndexArticles")
    .withIndex("by_slug", (q) => q.eq("slug", writing.slug))
    .first();
  if (stored && writing.kind !== (stored.kind ?? "article")) {
    throw new PostgresError({ code: "PROPOSAL_WRITING_INVALID", message: "A proposal cannot move a saved entry between articles and blog posts." });
  }
  if (stored && writing.bodyFormat !== (stored.bodyFormat ?? "vcode")) {
    throw new PostgresError({ code: "PROPOSAL_WRITING_INVALID", message: "A proposal cannot convert a saved entry to another format." });
  }
  if (writing.bodyFormat === "vcode") {
    try {
      prepareVCode(writing.body, stored ? { raw: stored.body_raw, ast: stored.body_ast } : undefined);
    } catch (error) {
      throw new PostgresError({ code: "PROPOSAL_WRITING_INVALID", message: error instanceof Error ? error.message : "Invalid VCode." });
    }
  }
}

export async function submitHandler(ctx: MutationCtx, args: SubmitArgs) {
  const actor = await requireRole(
    ctx,
    { apiKey: args.apiKey, actorEmail: args.actorEmail, adminIntent: "editorArticleWrite" },
    "editor",
  );

  const implied = await deriveProposalTargets(ctx, args.payload);
  if (implied.length === 0) {
    throw new PostgresError({
      code: "PROPOSAL_EMPTY",
      message: "A proposal needs at least one change.",
    });
  }
  for (const article of args.payload.articles ?? []) {
    const [target] = await deriveProposalTargets(ctx, { articles: [article] });
    const stored = target ? await ctx.db.query("substanceIndex").withIndex("by_slug", (q) => q.eq("slug", target.key)).unique() : null;
    if (stored) validateArticleChange(articleDocument(stored), article);
    else {
      const validation = validateArticleForIngestion(article);
      if (validation.ok === false) throw new PostgresError({ code: "PROPOSAL_ARTICLE_INVALID", message: `${article.title}: ${validation.message}` });
    }
  }

  if (args.payload.writing) await validateWritingProposal(ctx, args.payload.writing);

  const summary = args.summary.trim();
  if (summary.length === 0 || summary.length > SUMMARY_MAX_LENGTH) {
    throw new PostgresError({
      code: "PROPOSAL_SUMMARY_INVALID",
      message: `Summary must be 1 to ${SUMMARY_MAX_LENGTH} characters.`,
    });
  }

  const keys = new Set(implied.map((target) => `${target.kind}:${target.key}`));
  if (keys.size !== implied.length) {
    throw new PostgresError({
      code: "PROPOSAL_TARGET_DUPLICATE",
      message: "A payload may write each row once.",
    });
  }

  if (!Array.isArray(args.baselines) || args.baselines.length !== implied.length ||
      new Set(args.baselines.map((entry) => `${entry.kind}:${entry.key}`)).size !== implied.length) {
    throw new PostgresError({ code: "PROPOSAL_BASELINE_REQUIRED", message: "Every change needs its loaded baseline. Your draft is preserved; reload the source and reapply your edits." });
  }
  const targets: Array<(typeof implied)[number] & { baseHash: string }> = [];
  const snapshots: Array<(typeof implied)[number] & { document: unknown }> = [];
  for (const target of implied) {
    const baseline = args.baselines.find((entry) => entry.kind === target.kind && entry.key === target.key);
    const document = await readProposalTarget(ctx, target, "stored");
    const hashDocument = proposalHashDocument(target.kind, document);
    if (!baseline || contentHash(proposalComparableDocument(target.kind, baseline.document)) !==
        contentHash(proposalComparableDocument(target.kind, hashDocument))) {
      throw new PostgresError({
        code: "PROPOSAL_BASELINE_STALE",
        message: `Production changed since you loaded ${target.kind} "${target.key}". Your draft is preserved. Copy your edits, reload the latest source, reconcile the changes, and submit again.`,
      });
    }
    targets.push({ ...target, baseHash: contentHash(hashDocument) });
    snapshots.push({ ...target, document });
  }

  const prior = args.revisionOf ? await ctx.db.get(args.revisionOf) : null;
  if (args.revisionOf) {
    if (!prior) {
      throw new PostgresError({ code: "PROPOSAL_NOT_FOUND", message: "The proposal being revised no longer exists." });
    }
    if (prior.proposedBy !== actor.email && actor.role !== "admin") {
      throw new PostgresError({
        code: "PROPOSAL_NOT_OWNED",
        message: "Only the proposer or an admin can submit a revision of a proposal.",
      });
    }
    if (!REVISABLE_STATUSES.includes(prior.status) || !canTransition(prior.status, "superseded")) {
      throw new PostgresError({
        code: "PROPOSAL_STATUS_INVALID",
        message: `A ${prior.status.replace("_", " ")} proposal cannot be revised.`,
      });
    }
    if (!prior.targets.some((target) => keys.has(`${target.kind}:${target.key}`))) {
      throw new PostgresError({
        code: "PROPOSAL_REVISION_MISMATCH",
        message: "A revision must change at least one of the rows the earlier proposal changed.",
      });
    }
  }

  const feedbackRef = args.feedbackRef ?? readFeedbackRef((prior?.payload as { feedbackRef?: unknown } | undefined)?.feedbackRef);
  const now = new Date().toISOString();
  const proposalId = await ctx.db.insert("changeProposals", {
    proposedBy: actor.email,
    createdAt: now,
    updatedAt: now,
    status: "submitted",
    targets,
    payload: {
      ...args.payload,
      articlePatches: buildArticlePatches(args.payload as ProposalPayload, snapshots),
      ...(feedbackRef ? { feedbackRef } : {}),
    },
    summary,
    diff: buildProposalDiff(args.payload as ProposalPayload, snapshots),
    diffVersion: 1,
    comments: [],
    ...(args.revisionOf ? { revisionOf: args.revisionOf } : {}),
  });
  for (const target of targets) {
    if (target.kind === "article") await ctx.db.insert("articleProposalTargets", { slug: target.key, ownerEmail: actor.email, proposalId, createdAt: now });
  }
  if (prior) {
    await ctx.db.patch(prior._id, { status: "superseded", updatedAt: now });
    await clearInboxClaim(ctx, "proposals", prior._id);
  }
  return { proposalId };
}

export const submit = mutation({
  args: {
    apiKey: v.optional(v.string()),
    actorEmail: v.optional(v.string()),
    payload: changeProposalPayloadValidator,
    summary: v.string(),
    baselines: v.array(v.object({
      kind: v.union(v.literal("article"), v.literal("indexLayout"), v.literal("copyBlock"), v.literal("about"), v.literal("writing")),
      key: v.string(),
      document: v.any(),
    })),
    revisionOf: v.optional(v.id("changeProposals")),
  },
  handler: submitHandler,
});

const LIST_MINE_LIMIT = 50;

function proposalNameResolver(ctx: QueryCtx | MutationCtx) {
  const names = new Map<string, Promise<string | undefined>>();
  return (email: string) => {
    let name = names.get(email);
    if (!name) {
      name = ctx.db.query("contributorProfiles")
        .withIndex("by_membership_email", (q) => q.eq("membershipEmail", email))
        .first()
        .then((profile) => profile?.displayName);
      names.set(email, name);
    }
    return name;
  };
}

async function summarizeProposals(ctx: QueryCtx, rows: Doc<"changeProposals">[], actorEmail: string) {
  const nameOf = proposalNameResolver(ctx);
  return Promise.all(rows.map(async (row) => projectProposalSummary({
    ...row,
    proposerName: await nameOf(row.proposedBy),
    reviewerName: row.reviewedBy ? await nameOf(row.reviewedBy) : undefined,
  }, actorEmail)));
}

export async function listMineHandler(
  ctx: QueryCtx,
  args: { apiKey?: string; actorEmail?: string; limit?: number },
) {
  const actor = await requireRole(
    ctx,
    { apiKey: args.apiKey, actorEmail: args.actorEmail, adminIntent: "editorArticleWrite" },
    "editor",
  );
  const limit = Math.min(Math.max(Math.floor(args.limit ?? LIST_MINE_LIMIT), 1), LIST_MINE_LIMIT);
  const rows = await ctx.db
    .query("changeProposals")
    .withIndex("by_proposed_by", (q) => q.eq("proposedBy", actor.email))
    .order("desc")
    .take(limit);
  return summarizeProposals(ctx, rows, actor.email);
}

export const listMine = query({
  args: {
    apiKey: v.optional(v.string()),
    actorEmail: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: listMineHandler,
});

export async function countHandler(ctx: QueryCtx, args: { apiKey?: string; actorEmail?: string }) {
  const actor = await requireRole(
    ctx,
    { apiKey: args.apiKey, actorEmail: args.actorEmail, adminIntent: "editorArticleWrite" },
    "editor",
  );
  const submitted = actor.role === "admin"
    ? await ctx.db.query("changeProposals").withIndex("by_status", (q) => q.eq("status", "submitted")).collect()
    : await ctx.db.query("changeProposals")
      .withIndex("by_proposed_by_status", (q) => q.eq("proposedBy", actor.email).eq("status", "submitted")).collect();
  return { submitted: submitted.length };
}

export const count = query({
  args: {
    apiKey: v.optional(v.string()),
    actorEmail: v.optional(v.string()),
  },
  handler: countHandler,
});

const LIST_LIMIT = 200;

export async function listHandler(
  ctx: QueryCtx,
  args: { apiKey?: string; actorEmail?: string; status?: Doc<"changeProposals">["status"] },
) {
  const actor = await requireRole(
    ctx,
    { apiKey: args.apiKey, actorEmail: args.actorEmail, adminIntent: "editorArticleWrite" },
    "editor",
  );
  const status = args.status;
  const isActive = (row: Doc<"changeProposals">) =>
    row.status === "submitted" || row.status === "changes_requested";
  let rows: Doc<"changeProposals">[];
  if (actor.role !== "admin") {
    if (status) {
      const matches = ctx.db.query("changeProposals")
        .withIndex("by_proposed_by_status", (q) => q.eq("proposedBy", actor.email).eq("status", status)).order("desc");
      rows = status === "submitted" || status === "changes_requested" ? await matches.collect() : await matches.take(LIST_LIMIT);
    } else {
      const [submitted, returned, recent] = await Promise.all([
        ctx.db.query("changeProposals").withIndex("by_proposed_by_status", (q) => q.eq("proposedBy", actor.email).eq("status", "submitted")).collect(),
        ctx.db.query("changeProposals").withIndex("by_proposed_by_status", (q) => q.eq("proposedBy", actor.email).eq("status", "changes_requested")).collect(),
        ctx.db.query("changeProposals").withIndex("by_proposed_by", (q) => q.eq("proposedBy", actor.email)).order("desc").take(LIST_LIMIT),
      ]);
      rows = [...submitted, ...returned, ...recent.filter((row) => !isActive(row))];
    }
  } else if (status) {
    const matches = ctx.db.query("changeProposals").withIndex("by_status", (q) => q.eq("status", status)).order("desc");
    rows = status === "submitted" || status === "changes_requested" ? await matches.collect() : await matches.take(LIST_LIMIT);
  } else {
    const [submitted, returned, recent] = await Promise.all([
      ctx.db.query("changeProposals").withIndex("by_status", (q) => q.eq("status", "submitted")).collect(),
      ctx.db.query("changeProposals").withIndex("by_status", (q) => q.eq("status", "changes_requested")).collect(),
      ctx.db.query("changeProposals").order("desc").take(LIST_LIMIT),
    ]);
    rows = [...submitted, ...returned, ...recent.filter((row) => !isActive(row))];
  }
  rows.sort((left, right) => right.createdAt.localeCompare(left.createdAt) || right._creationTime - left._creationTime);
  return summarizeProposals(ctx, rows, actor.email);
}

export const list = query({
  args: {
    apiKey: v.optional(v.string()),
    actorEmail: v.optional(v.string()),
    status: v.optional(changeProposalStatusValidator),
  },
  handler: listHandler,
});

export async function getHandler(
  ctx: QueryCtx,
  args: { apiKey?: string; actorEmail?: string; id: Id<"changeProposals">; includePayload?: boolean },
) {
  const actor = await requireRole(
    ctx,
    { apiKey: args.apiKey, actorEmail: args.actorEmail, adminIntent: "editorArticleWrite" },
    "editor",
  );
  const row = await ctx.db.get(args.id);
  if (!row || (actor.role !== "admin" && row.proposedBy !== actor.email)) {
    return null;
  }
  const liveHashes: Array<Pick<Doc<"changeProposals">["targets"][number], "kind" | "key"> & { hash: string }> = [];
  const baseline: Array<Pick<Doc<"changeProposals">["targets"][number], "kind" | "key"> & { document: unknown }> = [];
  for (const target of row.targets) {
    const document = await readProposalTarget(ctx, target, "stored");
    baseline.push({ kind: target.kind, key: target.key, document });
    liveHashes.push({
      kind: target.kind,
      key: target.key,
      hash: contentHash(proposalHashDocument(target.kind, document)),
    });
  }
  const liveMatchesBase = liveHashes.every((live, index) => live.hash === row.targets[index].baseHash);
  const comparisonMode = row.snapshotBefore ? "applied"
    : row.diffVersion === 1 ? "submitted"
    : liveMatchesBase && (row.status === "submitted" || row.status === "changes_requested") ? "verified_live"
    : "unavailable";
  const diff = comparisonMode === "applied"
    ? buildProposalDiff(row.payload as ProposalPayload, row.snapshotBefore)
    : comparisonMode === "submitted" ? row.diff
    : comparisonMode === "verified_live" ? buildProposalDiff(row.payload as ProposalPayload, baseline)
    : "";
  const patchBaseline = comparisonMode === "applied" ? row.snapshotBefore as ProposalSnapshotEntry[]
    : comparisonMode === "verified_live" || (comparisonMode === "submitted" && liveMatchesBase) ? baseline
    : null;
  let articlePatches: ArticlePatch[] | undefined = comparisonMode === "applied" ? undefined
    : readArticlePatches((row.payload as { articlePatches?: unknown } | null)?.articlePatches) ?? undefined;
  if (!articlePatches && patchBaseline) {
    try {
      articlePatches = buildArticlePatches(row.payload as ProposalPayload, patchBaseline);
    } catch {
      articlePatches = undefined;
    }
  }
  const comparisonNote = comparisonMode === "unavailable"
    ? "Historical comparison unavailable: this older proposal has no verified server-generated diff or captured baseline. The original client-supplied diff is not trusted. Reload current production and submit a fresh revision to review these changes."
    : undefined;
  const nameOf = proposalNameResolver(ctx);
  return projectProposalDetail({
    ...row,
    proposerName: await nameOf(row.proposedBy),
    reviewerName: row.reviewedBy ? await nameOf(row.reviewedBy) : undefined,
    comments: await Promise.all(row.comments.map(async (comment) => ({
      ...comment, authorName: await nameOf(comment.by),
    }))),
    diff, comparisonMode, comparisonNote, liveHashes, articlePatches,
  }, actor.email, { includePayload: args.includePayload });
}

export const get = query({
  args: {
    apiKey: v.optional(v.string()),
    actorEmail: v.optional(v.string()),
    id: v.id("changeProposals"),
    includePayload: v.optional(v.boolean()),
  },
  handler: getHandler,
});

const COMMENT_MAX_LENGTH = 5_000;

export async function commentHandler(
  ctx: MutationCtx,
  args: { apiKey?: string; actorEmail?: string; id: Id<"changeProposals">; text: string },
) {
  const actor = await requireRole(
    ctx,
    { apiKey: args.apiKey, actorEmail: args.actorEmail, adminIntent: "editorArticleWrite" },
    "editor",
  );
  const text = args.text.trim();
  if (text.length === 0 || text.length > COMMENT_MAX_LENGTH) {
    throw new PostgresError({
      code: "PROPOSAL_COMMENT_INVALID",
      message: `A comment must be 1 to ${COMMENT_MAX_LENGTH} characters.`,
    });
  }
  const row = await ctx.db.get(args.id);
  if (!row || (actor.role !== "admin" && row.proposedBy !== actor.email)) {
    throw new PostgresError({ code: "PROPOSAL_NOT_FOUND", message: "No proposal with that id." });
  }
  const comment = { by: actor.email, at: new Date().toISOString(), text };
  await ctx.db.patch(row._id, { comments: [...row.comments, comment], updatedAt: comment.at });
  return projectProposalComment({ ...comment, authorName: await proposalNameResolver(ctx)(actor.email) });
}

export const comment = mutation({
  args: {
    apiKey: v.optional(v.string()),
    actorEmail: v.optional(v.string()),
    id: v.id("changeProposals"),
    text: v.string(),
  },
  handler: commentHandler,
});
