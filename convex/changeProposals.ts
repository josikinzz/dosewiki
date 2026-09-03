import { ConvexError, v } from "convex/values";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { canTransition, type ProposalStatus } from "../lib/proposals/proposalStatus";
import { requireRole } from "./lib/auth";
import { deriveProposalTargets, hashProposalTarget } from "./lib/changeProposalTargets";
import {
  indexLayoutValidator,
  substanceArticleLightValidator,
  validateArticleForIngestion,
} from "./lib/validators";
import { copyBlockDocumentValidator, type CopyBlockDocument } from "./copyBlocks";
import { changeProposalStatusValidator } from "./schema";
import { aboutDocumentValidator, type AboutDocument } from "./siteConfig";

/**
 * Editor change proposals: the commit panel's staged save, held for an admin
 * instead of written. This module owns submission, the reads (the editor's
 * own, the review queue, one proposal with live hashes) and discussion
 * comments; approve, apply, reject, and revert live in changeProposalReview.ts.
 *
 * Document shape (`changeProposals`):
 *   proposedBy, createdAt, updatedAt, status, targets[{kind,key,baseHash}],
 *   payload (the save-to-convex body), summary, diff, comments[], and the
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
  diff: string;
  /** The returned proposal this one replaces; it becomes `superseded` in the same mutation. */
  revisionOf?: Id<"changeProposals">;
};

const SUMMARY_MAX_LENGTH = 500;
const DIFF_MAX_LENGTH = 500_000;

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
    throw new ConvexError({
      code: "PROPOSAL_EMPTY",
      message: "A proposal needs at least one change.",
    });
  }
  for (const article of args.payload.articles ?? []) {
    const validation = validateArticleForIngestion(article);
    if (validation.ok === false) {
      throw new ConvexError({
        code: "PROPOSAL_ARTICLE_INVALID",
        message: `${article.title}: ${validation.message}`,
      });
    }
  }

  const summary = args.summary.trim();
  if (summary.length === 0 || summary.length > SUMMARY_MAX_LENGTH) {
    throw new ConvexError({
      code: "PROPOSAL_SUMMARY_INVALID",
      message: `Summary must be 1 to ${SUMMARY_MAX_LENGTH} characters.`,
    });
  }
  if (args.diff.length > DIFF_MAX_LENGTH) {
    throw new ConvexError({
      code: "PROPOSAL_DIFF_TOO_LARGE",
      message: `Diff exceeds ${DIFF_MAX_LENGTH} characters.`,
    });
  }

  const keys = new Set(implied.map((target) => `${target.kind}:${target.key}`));
  if (keys.size !== implied.length) {
    throw new ConvexError({
      code: "PROPOSAL_TARGET_DUPLICATE",
      message: "A payload may write each row once.",
    });
  }

  const targets = [];
  for (const target of implied) {
    targets.push({ kind: target.kind, key: target.key, baseHash: await hashProposalTarget(ctx, target) });
  }

  // Rebase: the earlier revision must be the actor's own (or the actor an
  // admin), still open to the proposer, and about at least one of the same
  // rows; it is superseded in the same write so the queue never shows both
  // revisions as live.
  const prior = args.revisionOf ? await ctx.db.get(args.revisionOf) : null;
  if (args.revisionOf) {
    if (!prior) {
      throw new ConvexError({ code: "PROPOSAL_NOT_FOUND", message: "The proposal being revised no longer exists." });
    }
    if (prior.proposedBy !== actor.email && actor.role !== "admin") {
      throw new ConvexError({
        code: "PROPOSAL_NOT_OWNED",
        message: "Only the proposer or an admin can submit a revision of a proposal.",
      });
    }
    if (!REVISABLE_STATUSES.includes(prior.status) || !canTransition(prior.status, "superseded")) {
      throw new ConvexError({
        code: "PROPOSAL_STATUS_INVALID",
        message: `A ${prior.status.replace("_", " ")} proposal cannot be revised.`,
      });
    }
    if (!prior.targets.some((target) => keys.has(`${target.kind}:${target.key}`))) {
      throw new ConvexError({
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
    diff: args.diff,
    comments: [],
    ...(args.revisionOf ? { revisionOf: args.revisionOf } : {}),
  });
  if (prior) {
    await ctx.db.patch(prior._id, { status: "superseded", updatedAt: now });
  }
  return { proposalId };
}

/**
 * Submit one commit-panel save as a proposal. Editor floor. Targets are
 * derived from the payload and the base hash of each is read from production
 * here, so a stale client can never pin a hash it did not observe.
 */
export const submit = mutation({
  args: {
    apiKey: v.optional(v.string()),
    actorEmail: v.optional(v.string()),
    payload: changeProposalPayloadValidator,
    summary: v.string(),
    diff: v.string(),
    revisionOf: v.optional(v.id("changeProposals")),
  },
  handler: submitHandler,
});

const LIST_MINE_LIMIT = 50;

function summarizeProposal(row: Doc<"changeProposals">) {
  return {
    _id: row._id,
    proposedBy: row.proposedBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    status: row.status,
    targets: row.targets,
    summary: row.summary,
    revisionOf: row.revisionOf,
    reviewedBy: row.reviewedBy,
    reviewedAt: row.reviewedAt,
    reviewNotes: row.reviewNotes,
    commentCount: row.comments.length,
    appliedAt: row.appliedAt,
    conflictReason: row.conflictReason,
  };
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
  return rows.map(summarizeProposal);
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
  await requireRole(
    ctx,
    { apiKey: args.apiKey, actorEmail: args.actorEmail, adminIntent: "editorArticleWrite" },
    "editor",
  );
  const submitted = await ctx.db
    .query("changeProposals")
    .withIndex("by_status", (q) => q.eq("status", "submitted"))
    .collect();
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
  await requireRole(
    ctx,
    { apiKey: args.apiKey, actorEmail: args.actorEmail, adminIntent: "editorArticleWrite" },
    "editor",
  );
  const status = args.status;
  const rows = status
    ? await ctx.db
        .query("changeProposals")
        .withIndex("by_status", (q) => q.eq("status", status))
        .order("desc")
        .take(LIST_LIMIT)
    : await ctx.db.query("changeProposals").order("desc").take(LIST_LIMIT);
  return rows.map(summarizeProposal);
}

/** The review queue: every proposal, or those in one status, newest first, without payload or diff. Editor floor. */
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
  args: { apiKey?: string; actorEmail?: string; id: Id<"changeProposals"> },
) {
  await requireRole(
    ctx,
    { apiKey: args.apiKey, actorEmail: args.actorEmail, adminIntent: "editorArticleWrite" },
    "editor",
  );
  const row = await ctx.db.get(args.id);
  if (!row) {
    return null;
  }
  // The production hash of each target as it stands now: a reviewer sees a
  // target has drifted from `baseHash` before approve refuses it.
  const liveHashes = [];
  for (const target of row.targets) {
    liveHashes.push({
      kind: target.kind,
      key: target.key,
      hash: await hashProposalTarget(ctx, { kind: target.kind, key: target.key }),
    });
  }
  return { ...row, liveHashes };
}

/** One proposal in full, with the live hash of every target. Editor floor. */
export const get = query({
  args: {
    apiKey: v.optional(v.string()),
    actorEmail: v.optional(v.string()),
    id: v.id("changeProposals"),
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
    throw new ConvexError({
      code: "PROPOSAL_COMMENT_INVALID",
      message: `A comment must be 1 to ${COMMENT_MAX_LENGTH} characters.`,
    });
  }
  const row = await ctx.db.get(args.id);
  if (!row) {
    throw new ConvexError({ code: "PROPOSAL_NOT_FOUND", message: "No proposal with that id." });
  }
  const comment = { by: actor.email, at: new Date().toISOString(), text };
  await ctx.db.patch(row._id, { comments: [...row.comments, comment], updatedAt: comment.at });
  return comment;
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
