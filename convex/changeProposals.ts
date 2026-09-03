import { ConvexError, v } from "convex/values";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { requireRole } from "./lib/auth";
import {
  deriveProposalTargets,
  hashProposalTarget,
  type ProposalTargetRef,
} from "./lib/changeProposalTargets";
import {
  indexLayoutValidator,
  substanceArticleLightValidator,
  validateArticleForIngestion,
} from "./lib/validators";
import { changeProposalTargetKindValidator } from "./schema";

/**
 * Editor change proposals: the commit panel's staged save, held for an admin
 * instead of written. Wave 1 covers submission and the editor's own reads;
 * review, apply, reject, and revert land in wave 2 on the same document.
 *
 * Document shape (`changeProposals`):
 *   proposedBy, createdAt, updatedAt, status, targets[{kind,key,baseHash}],
 *   payload (the save-to-convex body), summary, diff, comments[], and the
 *   optional review/apply fields declared in schema.ts.
 */

/** The save-to-convex body a proposal wraps, validated with the save validators. */
export const changeProposalPayloadValidator = v.object({
  articles: v.optional(v.array(substanceArticleLightValidator)),
  indexLayouts: v.optional(v.array(indexLayoutValidator)),
  changelog: v.optional(
    v.object({
      markdown: v.string(),
      articles: v.array(v.object({ id: v.number(), title: v.string(), slug: v.string() })),
    }),
  ),
});

const proposalTargetRefValidator = v.object({
  kind: changeProposalTargetKindValidator,
  key: v.string(),
});

type SubmitArgs = {
  apiKey?: string;
  actorEmail?: string;
  payload: {
    articles?: Array<{ id: number | null; title: string; slug?: string } & Record<string, unknown>>;
    indexLayouts?: Array<{ type: "psychoactive" | "chemical" | "mechanism" } & Record<string, unknown>>;
    changelog?: { markdown: string; articles: Array<{ id: number; title: string; slug: string }> };
  };
  summary: string;
  diff: string;
  targets: ProposalTargetRef[];
};

const SUMMARY_MAX_LENGTH = 500;
const DIFF_MAX_LENGTH = 500_000;

export async function submitHandler(ctx: MutationCtx, args: SubmitArgs) {
  const actor = await requireRole(
    ctx,
    { apiKey: args.apiKey, actorEmail: args.actorEmail, adminIntent: "editorArticleWrite" },
    "editor",
  );

  const articles = args.payload.articles ?? [];
  const layouts = args.payload.indexLayouts ?? [];
  if (articles.length === 0 && layouts.length === 0) {
    throw new ConvexError({
      code: "PROPOSAL_EMPTY",
      message: "A proposal needs at least one article or index layout change.",
    });
  }
  for (const article of articles) {
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

  // The caller names the targets, but every row the payload writes must be
  // among them: a proposal may never touch production the hashes did not pin.
  const named = new Set(args.targets.map((target) => `${target.kind}:${target.key}`));
  for (const implied of deriveProposalTargets(args.payload)) {
    if (!named.has(`${implied.kind}:${implied.key}`)) {
      throw new ConvexError({
        code: "PROPOSAL_TARGET_MISSING",
        message: `Payload changes ${implied.kind} "${implied.key}" but no target names it.`,
      });
    }
  }
  if (named.size !== args.targets.length) {
    throw new ConvexError({
      code: "PROPOSAL_TARGET_DUPLICATE",
      message: "Each target may appear once.",
    });
  }

  const targets = [];
  for (const target of args.targets) {
    targets.push({ kind: target.kind, key: target.key, baseHash: await hashProposalTarget(ctx, target) });
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
  });
  return { proposalId };
}

/**
 * Submit one commit-panel save as a proposal. Editor floor. `targets` carries
 * kind and key only; the base hash of each is read from production here so a
 * stale client can never pin a hash it did not observe.
 */
export const submit = mutation({
  args: {
    apiKey: v.optional(v.string()),
    actorEmail: v.optional(v.string()),
    payload: changeProposalPayloadValidator,
    summary: v.string(),
    diff: v.string(),
    targets: v.array(proposalTargetRefValidator),
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
