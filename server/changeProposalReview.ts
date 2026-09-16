import { PostgresError, v } from "../lib/postgres/runtime/values";
import { type MutationCtx } from "../lib/postgres/runtime/server";
import { mutation } from "./lib/indexedMutation";
import type { Doc, Id } from "../lib/postgres/runtime/dataModel";
import { deriveSubmittedBy } from "../lib/changelog/submitterStamp";
import { contentHash } from "../lib/proposals/contentHash";
import { canTransition, type ProposalStatus } from "../lib/proposals/proposalStatus";
import { truncateDiffMarkdown } from "../lib/proposals/diffMarkdown";
import { addEntryHandler } from "./changelog";
import { requireRole, type AuthorizedActor } from "./lib/auth";
import {
  applyDocuments,
  payloadDocuments,
  snapshotProposalTarget,
  type ProposalPayload,
  type ProposalSnapshotEntry,
} from "./lib/changeProposalApply";
import { deriveProposalTargets, hashProposalTarget, proposalHashDocument } from "./lib/changeProposalTargets";
import { proposalChangelogArticles, type ProposalArticleRow } from "../lib/proposals/proposalChangelogStamp";
import { buildProposalDiff } from "./lib/changeProposalDiff";
import { indexLayoutRevalidationPath, type IndexLayoutType } from "./lib/saveRevalidationPaths";

/**
 * Admin review of change proposals: approve (which applies in the same
 * mutation), reject, revert. Every branch is admin floor and moves the
 * proposal only along `canTransition`.
 *
 * Approve is compare-and-swap: each target's live hash must still equal the
 * `baseHash` submit recorded, otherwise the proposal flips to
 * `changes_requested` with the drifted targets named and nothing else is
 * written. Revert is the mirror image against `appliedHashes`.
 */

type ReviewArgs = { apiKey?: string; actorEmail?: string; proposalId: Id<"changeProposals"> };

const reviewArgs = {
  apiKey: v.optional(v.string()),
  actorEmail: v.optional(v.string()),
  proposalId: v.id("changeProposals"),
};

async function requireReviewer(ctx: MutationCtx, args: ReviewArgs): Promise<AuthorizedActor> {
  return requireRole(
    ctx,
    { apiKey: args.apiKey, actorEmail: args.actorEmail, adminIntent: "editorArticleWrite" },
    "admin",
  );
}

async function loadProposal(ctx: MutationCtx, proposalId: Id<"changeProposals">) {
  const proposal = await ctx.db.get(proposalId);
  if (!proposal) {
    throw new PostgresError({ code: "PROPOSAL_NOT_FOUND", message: "That proposal no longer exists." });
  }
  return proposal;
}

function replayRevalidationPaths(proposal: Doc<"changeProposals">): string[] {
  const paths = new Set<string>();
  for (const target of proposal.targets) {
    if (target.kind === "article") { paths.add(`/${target.key}`); paths.add("/substances"); }
    else if (target.kind === "indexLayout") { paths.add("/substances"); paths.add(indexLayoutRevalidationPath(target.key as IndexLayoutType)); }
    else if (target.kind === "about") paths.add("/about");
    else if (target.kind === "copyBlock") paths.add("/copy-blocks");
  }
  return [...paths].sort();
}

function requireTransition(proposal: Doc<"changeProposals">, to: ProposalStatus) {
  if (!canTransition(proposal.status, to)) {
    throw new PostgresError({
      code: "PROPOSAL_STATUS_INVALID",
      message: `A ${proposal.status.replace("_", " ")} proposal cannot become ${to.replace("_", " ")}.`,
    });
  }
}

/**
 * The article rows the proposal's targets name, as production stands right
 * now. Read after the write so an applied entry stamps the id and slug the
 * reader will follow, exactly like the direct save's history row.
 */
async function readArticleRows(
  ctx: MutationCtx,
  targets: Doc<"changeProposals">["targets"],
): Promise<ProposalArticleRow[]> {
  const rows: ProposalArticleRow[] = [];
  for (const target of targets) {
    if (target.kind !== "article") continue;
    const row = await ctx.db
      .query("substanceIndex")
      .withIndex("by_slug", (q) => q.eq("slug", target.key))
      .first();
    rows.push({ slug: target.key, id: row?.id ?? null, title: row?.title ?? null });
  }
  return rows;
}

export async function approveAndApplyHandler(ctx: MutationCtx, args: ReviewArgs) {
  const actor = await requireReviewer(ctx, args);
  const proposal = await loadProposal(ctx, args.proposalId);
  if (proposal.proposedBy === actor.email) {
    throw new PostgresError({ code: "PROPOSAL_SELF_APPROVAL", message: "Another admin must review and approve your proposal." });
  }
  if (proposal.status === "applied") {
    return { status: "applied" as const, revalidatePaths: replayRevalidationPaths(proposal) };
  }
  requireTransition(proposal, "applied");
  const now = new Date().toISOString();

  // Compare-and-swap: read every target once, hash it, and keep the document
  // as the snapshot a revert writes back. Any drift means the editor diffed
  // against something that is no longer there.
  const snapshotBefore: ProposalSnapshotEntry[] = [];
  const drifted: string[] = [];
  const payload = proposal.payload as ProposalPayload;
  // An ID absent at submission may now resolve to a different slug. Re-resolve
  // the write destinations before the slug-based CAS can authorize any writes.
  try {
    const currentTargets = await deriveProposalTargets(ctx, payload);
    if (currentTargets.length !== proposal.targets.length || currentTargets.some((current) =>
      !proposal.targets.some((pinned) => pinned.kind === current.kind && pinned.key === current.key))) {
      drifted.push("the payload's write destinations");
    }
  } catch (error) {
    if (!(error instanceof PostgresError) || typeof error.data !== "object" || error.data === null ||
        error.data.code !== "PROPOSAL_SLUG_MOVE" || typeof error.data.message !== "string") throw error;
    drifted.push(error.data.message);
  }
  for (const target of proposal.targets) {
    const entry = await snapshotProposalTarget(ctx, target);
    if (contentHash(proposalHashDocument(target.kind, entry.document)) !== target.baseHash) {
      drifted.push(`${target.kind} "${target.key}"`);
    }
    snapshotBefore.push(entry);
  }
  if (drifted.length > 0) {
    const conflictReason = `Production changed since this proposal was drafted: ${drifted.join(", ")}. Rebase and resubmit.`;
    await ctx.db.patch(proposal._id, {
      status: "changes_requested",
      conflictReason,
      reviewedBy: actor.email,
      reviewedAt: now,
      updatedAt: now,
    });
    return { status: "changes_requested" as const, conflictReason };
  }

  const auth = { apiKey: args.apiKey, actorEmail: args.actorEmail, articleChangeId: `proposal-${proposal._id}`, articleSummary: proposal.summary };
  const revalidatePaths = await applyDocuments(ctx, auth, payloadDocuments(payload));

  const appliedHashes = [];
  for (const target of proposal.targets) {
    appliedHashes.push({ kind: target.kind, key: target.key, hash: await hashProposalTarget(ctx, target) });
  }

  const entryId = `proposal-${proposal._id}`;
  await addEntryHandler(ctx, {
    ...auth,
    entryId,
    createdAt: now,
    message: proposal.summary,
    markdown: truncateDiffMarkdown(buildProposalDiff(payload, snapshotBefore)),
    submittedBy: deriveSubmittedBy(proposal.proposedBy),
    articles: proposalChangelogArticles(payload.changelog?.articles, await readArticleRows(ctx, proposal.targets)),
  });

  await ctx.db.patch(proposal._id, {
    status: "applied",
    appliedAt: now,
    appliedChangelogEntryId: entryId,
    snapshotBefore,
    appliedHashes,
    reviewedBy: actor.email,
    reviewedAt: now,
    updatedAt: now,
  });
  return { status: "applied" as const, revalidatePaths };
}

/**
 * Approve and apply in one call. Admin floor. Returns `applied` with the
 * public paths to revalidate, or `changes_requested` with the conflict when
 * production drifted under the proposal.
 */
export const approveAndApply = mutation({
  args: reviewArgs,
  handler: approveAndApplyHandler,
});

export async function rejectHandler(ctx: MutationCtx, args: ReviewArgs & { note: string }) {
  const actor = await requireReviewer(ctx, args);
  const note = args.note.trim();
  if (note.length === 0) {
    throw new PostgresError({
      code: "PROPOSAL_NOTE_REQUIRED",
      message: "Rejecting a proposal needs a note for the editor.",
    });
  }
  const proposal = await loadProposal(ctx, args.proposalId);
  if (proposal.status === "rejected" && proposal.reviewedBy === actor.email && proposal.reviewNotes === note) return { status: "rejected" as const };
  requireTransition(proposal, "rejected");
  const now = new Date().toISOString();
  await ctx.db.patch(proposal._id, {
    status: "rejected",
    reviewNotes: note,
    reviewedBy: actor.email,
    reviewedAt: now,
    updatedAt: now,
  });
  return { status: "rejected" as const };
}

/** Reject with a note the editor sees. Admin floor. */
export const reject = mutation({
  args: { ...reviewArgs, note: v.string() },
  handler: rejectHandler,
});

export async function revertHandler(ctx: MutationCtx, args: ReviewArgs) {
  const actor = await requireReviewer(ctx, args);
  const proposal = await loadProposal(ctx, args.proposalId);
  if (proposal.status === "reverted") {
    return { status: "reverted" as const, revalidatePaths: replayRevalidationPaths(proposal) };
  }
  requireTransition(proposal, "reverted");

  const appliedHashes = proposal.appliedHashes ?? [];
  const snapshotBefore = (proposal.snapshotBefore ?? []) as ProposalSnapshotEntry[];
  const drifted: string[] = [];
  for (const applied of appliedHashes) {
    if ((await hashProposalTarget(ctx, applied)) !== applied.hash) {
      drifted.push(`${applied.kind} "${applied.key}"`);
    }
  }
  if (drifted.length > 0 || appliedHashes.length === 0 || snapshotBefore.length === 0) {
    throw new PostgresError({
      code: "REVERT_CONFLICT",
      message:
        drifted.length > 0
          ? `Production changed since this proposal was applied: ${drifted.join(", ")}. Edit it directly instead.`
          : "This proposal recorded no applied state to revert.",
    });
  }

  const auth = { apiKey: args.apiKey, actorEmail: args.actorEmail, articleChangeId: `revert-${proposal._id}`, articleSummary: `Reverted: ${proposal.summary}` };
  const revalidatePaths = await applyDocuments(ctx, auth, snapshotBefore);

  // An article snapshot is written back through the same reference merge the
  // apply used, and that merge keeps populated stored metadata over the
  // incoming (older) values. When the row does not hash back to what the
  // proposal pinned, the revert is incomplete and the throw rolls it back.
  for (const target of proposal.targets) {
    if (target.kind === "article" && (await hashProposalTarget(ctx, target)) !== target.baseHash) {
      throw new PostgresError({
        code: "REVERT_INCOMPLETE",
        message: `Reverting article "${target.key}" did not restore the row the proposal was drafted against. Edit it directly instead.`,
      });
    }
  }
  const now = new Date().toISOString();
  const payload = proposal.payload as ProposalPayload;
  const entryId = `revert-${proposal._id}`;
  await addEntryHandler(ctx, {
    ...auth,
    entryId,
    createdAt: now,
    message: `Reverted proposal ${proposal._id}`,
    markdown: `Reverted "${proposal.summary}".`,
    submittedBy: deriveSubmittedBy(actor.email),
    articles: proposalChangelogArticles(payload.changelog?.articles, await readArticleRows(ctx, proposal.targets)),
  });

  await ctx.db.patch(proposal._id, {
    status: "reverted",
    revertedAt: now,
    updatedAt: now,
  });
  return { status: "reverted" as const, revalidatePaths };
}

/**
 * Write `snapshotBefore` back. Admin floor; only from `applied`, and only
 * while every target still hashes to what the apply left behind.
 */
export const revert = mutation({
  args: reviewArgs,
  handler: revertHandler,
});
