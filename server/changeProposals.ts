import { PostgresError, v } from "../lib/postgres/runtime/values";
import { query, type MutationCtx, type QueryCtx } from "../lib/postgres/runtime/server";
import { mutation } from "./lib/indexedMutation";
import type { Doc, Id } from "../lib/postgres/runtime/dataModel";
import { canTransition, type ProposalStatus } from "../lib/proposals/proposalStatus";
import { contentHash } from "../lib/proposals/contentHash";
import { proposalComparableDocument, type ProposalBaseline } from "../lib/proposals/proposalBaseline";
import { buildProposalDiff } from "./lib/changeProposalDiff";
import type { ProposalPayload } from "./lib/changeProposalApply";
import { requireRole } from "./lib/auth";
import { deriveProposalTargets, proposalHashDocument, readProposalTarget } from "./lib/changeProposalTargets";
import {
  indexLayoutValidator,
  substanceArticleLightValidator,
  validateArticleForIngestion,
} from "./lib/validators";
import { copyBlockDocumentValidator, type CopyBlockDocument } from "./copyBlocks";
import { changeProposalStatusValidator } from "./schema";
import { aboutDocumentValidator, type AboutDocument } from "./siteConfig";
import { projectProposalComment, projectProposalDetail, projectProposalSummary } from "../lib/proposals/proposalPublic";
import { articleDocument, validateArticleChange } from "./lib/articleLifecycleValidation";

/**
 * Editor change proposals: the commit panel's staged save, held for an admin
 * instead of written. This module owns submission, the reads (the editor's
 * own, the review queue, one proposal with live hashes) and discussion
 * comments; approve, apply, reject, and revert live in changeProposalReview.ts.
 *
 * Document shape (`changeProposals`):
 *   proposedBy, createdAt, updatedAt, status, targets[{kind,key,baseHash}],
 *   payload (the save-article body), summary, diff, comments[], and the
 *   optional review/apply fields declared in schema.ts.
 */

/** The body a proposal wraps, validated with the validators the direct saves use. */
export const changeProposalPayloadValidator = v.object({
  articles: v.optional(v.array(substanceArticleLightValidator)),
  indexLayouts: v.optional(v.array(indexLayoutValidator)),
  copyBlocks: v.optional(v.array(copyBlockDocumentValidator)),
  about: v.optional(aboutDocumentValidator),
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
    changelog?: { markdown: string; articles: Array<{ id: number; title: string; slug: string }> };
  };
  summary: string;
  baselines: ProposalBaseline[];
  /** The returned proposal this one replaces; it becomes `superseded` in the same mutation. */
  revisionOf?: Id<"changeProposals">;
};

const SUMMARY_MAX_LENGTH = 500;

/** A proposal an editor may rebase: returned with changes requested, or still waiting. */
const REVISABLE_STATUSES: readonly ProposalStatus[] = ["submitted", "changes_requested"];

export async function submitHandler(ctx: MutationCtx, args: SubmitArgs) {
  const actor = await requireRole(
    ctx,
    { apiKey: args.apiKey, actorEmail: args.actorEmail, adminIntent: "editorArticleWrite" },
    "editor",
  );

  // Targets are derived from the payload here, never taken from the caller:
  // a proposal may never pin (and on revert, write back) a row the payload
  // does not touch. Emptiness is derived from every kind the payload can
  // carry, so a proposal that changes only a copy block or the About page is
  // not refused here.
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
  const targets = [];
  const snapshots = [];
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

  // Rebase: the earlier revision must be the actor's own (or the actor an
  // admin), still open to the proposer, and about at least one of the same
  // rows; it is superseded in the same write so the queue never shows both
  // revisions as live.
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

  const now = new Date().toISOString();
  const proposalId = await ctx.db.insert("changeProposals", {
    proposedBy: actor.email,
    createdAt: now,
    updatedAt: now,
    status: "submitted",
    targets,
    payload: args.payload,
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
  }
  return { proposalId };
}

/**
 * Submit one commit-panel save as a proposal. Each loaded baseline must match
 * production before the server pins its hash and generates the review diff.
 */
export const submit = mutation({
  args: {
    apiKey: v.optional(v.string()),
    actorEmail: v.optional(v.string()),
    payload: changeProposalPayloadValidator,
    summary: v.string(),
    baselines: v.array(v.object({
      kind: v.union(v.literal("article"), v.literal("indexLayout"), v.literal("copyBlock"), v.literal("about")),
      key: v.string(),
      document: v.any(),
    })),
    revisionOf: v.optional(v.id("changeProposals")),
  },
  handler: submitHandler,
});

const LIST_MINE_LIMIT = 50;

/** Only an explicitly linked public profile may supply a display name. */
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

/** The actor's own proposals, newest first, without payload or diff. Editor floor. */
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

/** Open-queue size for rail badges. Editor floor. */
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

/** Admin-global review queue; editors see only their own submissions. */
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
  // The production hash of each target as it stands now: a reviewer sees a
  // target has drifted from `baseHash` before approve refuses it.
  const liveHashes = [];
  const baseline = [];
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
    diff, comparisonMode, comparisonNote, liveHashes,
  }, actor.email, { includePayload: args.includePayload });
}

/** One proposal in full, with the live hash of every target. Editor floor. */
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

/** Append a discussion comment. Editor floor; any status, including terminal ones. */
export const comment = mutation({
  args: {
    apiKey: v.optional(v.string()),
    actorEmail: v.optional(v.string()),
    id: v.id("changeProposals"),
    text: v.string(),
  },
  handler: commentHandler,
});
