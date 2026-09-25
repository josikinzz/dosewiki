/**
 * How a reader's article feedback connects to the change that answers it.
 * Client-safe (no node imports), so the Postgres functions, the routes, the
 * feedback review panel and the in-page article editor read one shape.
 *
 * Everything here is advisory. Feedback is not a Review Flag: a link or an
 * outcome never gates approval or publication, and a proposal's review never
 * reads it. The words are recorded under Intake Language in docs/glossary.md.
 *
 * Where it is stored: on the feedback item's decision log (jsonb), so no
 * schema change is needed. Linking a change appends an entry whose status does
 * not move (`from` equals `to`) and that carries `linked_change`; an explicit
 * outcome rides on the decision entry that closes the item as `outcome`. A
 * proposal started from feedback carries `payload.feedbackRef` with the
 * feedback id and article section only: never the reader's contact details,
 * their words, or anything else from the feedback row.
 */

import type { IntakeStatus } from "./intakeStatus";
import type { DecisionLogEntry } from "./decisionLog";

// ---------------------------------------------------------------------------
// Explicit outcomes: closing feedback without a correction.

export const FEEDBACK_OUTCOMES = ["duplicate", "explanation_provided", "no_change_needed"] as const;

export type FeedbackOutcome = (typeof FEEDBACK_OUTCOMES)[number];

export const FEEDBACK_OUTCOME_LABEL: Record<FeedbackOutcome, string> = {
  duplicate: "Duplicate",
  explanation_provided: "Explanation provided",
  no_change_needed: "No change needed",
};

/**
 * The shared intake status each outcome closes the item with. A duplicate is
 * handled by another item and an explanation answers the reader, so both are
 * Resolved; No change needed declines the suggestion, so it is Rejected.
 */
export const FEEDBACK_OUTCOME_STATUS = {
  duplicate: "resolved",
  explanation_provided: "resolved",
  no_change_needed: "rejected",
} as const satisfies Record<FeedbackOutcome, IntakeStatus>;

export function isFeedbackOutcome(value: unknown): value is FeedbackOutcome {
  return typeof value === "string" && (FEEDBACK_OUTCOMES as readonly string[]).includes(value);
}

// ---------------------------------------------------------------------------
// Linked changes.

/** A proposal (`changeProposals` id) or a published revision (`articleRevisions` id). */
export type LinkedChange = { kind: "proposal"; id: string } | { kind: "revision"; id: string };

export function isLinkedChange(value: unknown): value is LinkedChange {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    (record.kind === "proposal" || record.kind === "revision") &&
    typeof record.id === "string" &&
    record.id.trim().length > 0 &&
    record.id.length <= 200
  );
}

/** Every change linked on the item, oldest first, each once, with when and by whom. */
export function linkedChangesOf(
  log: readonly DecisionLogEntry[],
): Array<{ change: LinkedChange; at: string; actor: string }> {
  const seen = new Set<string>();
  const links: Array<{ change: LinkedChange; at: string; actor: string }> = [];
  for (const entry of log) {
    const change = entry.linked_change;
    if (!change) continue;
    const key = `${change.kind}:${change.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    links.push({ change, at: entry.at, actor: entry.actor });
  }
  return links;
}

/** What a proposal started from feedback carries: the feedback id and the section, nothing else. */
export type FeedbackRef = { id: string; section?: string };

/** Read a stored or submitted `feedbackRef`, keeping only the id and section. */
export function readFeedbackRef(value: unknown): FeedbackRef | undefined {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const id = typeof record.id === "string" ? record.id.trim() : "";
  if (!id || id.length > 200 || !/^[A-Za-z0-9_-]+$/.test(id)) return undefined;
  const section = typeof record.section === "string" && /^[a-z_]{1,40}$/.test(record.section) ? record.section : undefined;
  return section ? { id, section } : { id };
}

// ---------------------------------------------------------------------------
// The outcome of a linked change.

/**
 * Where a linked change stands. Only `published` is a completed correction;
 * every other state reads as not corrected yet, or not corrected at all.
 *
 * - pending: a proposal waiting on an admin (`submitted`).
 * - returned: sent back to its author for changes (`changes_requested`).
 * - published: applied, or a linked published revision; names the revision.
 * - rejected: an admin declined the proposal.
 * - withdrawn: replaced (`superseded`) with no later revision found.
 * - reverted: applied and then undone, or a revision later restored away.
 * - unavailable: the linked change no longer exists or is not readable.
 */
export const CORRECTION_STATES = [
  "pending",
  "returned",
  "published",
  "rejected",
  "withdrawn",
  "reverted",
  "unavailable",
] as const;

export type CorrectionState = (typeof CORRECTION_STATES)[number];

export const CORRECTION_STATE_LABEL: Record<CorrectionState, string> = {
  pending: "Proposal pending",
  returned: "Proposal returned for changes",
  published: "Correction published",
  rejected: "Proposal rejected",
  withdrawn: "Proposal withdrawn",
  reverted: "Correction reverted",
  unavailable: "Change unavailable",
};

export const CORRECTION_STATE_TONE: Record<CorrectionState, "info" | "caution" | "success" | "danger" | "neutral"> = {
  pending: "info",
  returned: "caution",
  published: "success",
  rejected: "danger",
  withdrawn: "neutral",
  reverted: "danger",
  unavailable: "neutral",
};

export function isCompletedCorrection(state: CorrectionState): boolean {
  return state === "published";
}

/** A proposal as the correction panel shows it: no names, emails, payload or diff. */
export type CorrectionProposal = { id: string; status: string; summary: string; createdAt: string };

/** A published article revision as the correction panel shows it: no actor, no documents. */
export type CorrectionRevision = { id: string; summary: string; createdAt: string };

export type ResolvedCorrection = {
  change: LinkedChange;
  linkedAt: string;
  state: CorrectionState;
  /** The proposal the outcome was read from: the linked one, or its latest revision. */
  proposal?: CorrectionProposal;
  /** Set when the linked proposal was replaced by a revision. */
  revisedFrom?: string;
  /** The published revision a correction produced, or the linked revision. */
  revision?: CorrectionRevision;
};

/** The candidates "Link existing change" offers for one article. */
export type CorrectionCandidates = { proposals: CorrectionProposal[]; revisions: CorrectionRevision[] };

type ProposalFacts = { _id: string; status: string; summary: string; createdAt: string; revisionOf?: string };
type RevisionFacts = { _id: string; changeId: string; summary: string; createdAt: string; restoredFrom?: string };

/** Hops a superseded chain may take before the resolver stops following it. */
const MAX_REVISION_HOPS = 20;

/**
 * Resolve linked changes against what production holds now. Pure: the caller
 * reads the article's proposals and revisions and passes them in.
 *
 * A superseded proposal is followed to the revision that replaced it, so a
 * correction reworked after review still reaches its published revision. An
 * applied proposal names the revision its apply recorded (change id
 * `proposal-<id>:<slug>`); one later reverted (`revert-<id>:<slug>`) reads as
 * reverted, never as a completed correction.
 */
export function resolveCorrections(
  links: ReadonlyArray<{ change: LinkedChange; at: string }>,
  facts: { slug: string; proposals: readonly ProposalFacts[]; revisions: readonly RevisionFacts[] },
): ResolvedCorrection[] {
  const proposalById = new Map(facts.proposals.map((row) => [row._id, row]));
  const successorOf = new Map<string, ProposalFacts>();
  for (const row of facts.proposals) {
    if (row.revisionOf) successorOf.set(row.revisionOf, row);
  }
  const revisionByChange = new Map(facts.revisions.map((row) => [row.changeId, row]));
  const revisionById = new Map(facts.revisions.map((row) => [row._id, row]));
  const restored = new Set(facts.revisions.map((row) => row.restoredFrom).filter(Boolean));

  return links.map(({ change, at }): ResolvedCorrection => {
    if (change.kind === "revision") {
      const revision = revisionById.get(change.id);
      if (!revision) return { change, linkedAt: at, state: "unavailable" };
      return {
        change,
        linkedAt: at,
        state: restored.has(revision._id) ? "reverted" : "published",
        revision: correctionRevision(revision),
      };
    }

    let proposal = proposalById.get(change.id);
    if (!proposal) return { change, linkedAt: at, state: "unavailable" };
    for (let hop = 0; proposal.status === "superseded" && hop < MAX_REVISION_HOPS; hop += 1) {
      const next = successorOf.get(proposal._id);
      if (!next) break;
      proposal = next;
    }
    const revisedFrom = proposal._id !== change.id ? change.id : undefined;
    const base = {
      change,
      linkedAt: at,
      proposal: correctionProposal(proposal),
      ...(revisedFrom ? { revisedFrom } : {}),
    };
    switch (proposal.status) {
      case "submitted":
        return { ...base, state: "pending" };
      case "changes_requested":
        return { ...base, state: "returned" };
      case "rejected":
        return { ...base, state: "rejected" };
      case "superseded":
        return { ...base, state: "withdrawn" };
      case "applied":
      case "reverted": {
        const applied = revisionByChange.get(`proposal-${proposal._id}:${facts.slug}`);
        const reverted = proposal.status === "reverted" || revisionByChange.has(`revert-${proposal._id}:${facts.slug}`);
        return {
          ...base,
          state: reverted ? "reverted" : "published",
          ...(applied ? { revision: correctionRevision(applied) } : {}),
        };
      }
      default:
        return { ...base, state: "unavailable" };
    }
  });
}

function correctionProposal(row: ProposalFacts): CorrectionProposal {
  return { id: row._id, status: row.status, summary: row.summary, createdAt: row.createdAt };
}

function correctionRevision(row: RevisionFacts): CorrectionRevision {
  return { id: row._id, summary: row.summary, createdAt: row.createdAt };
}

// ---------------------------------------------------------------------------
// Start correction: the in-page article editor, opened on a section.

export const CORRECTION_FEEDBACK_PARAM = "feedback";
export const CORRECTION_SECTION_PARAM = "section";

/** The feedback task link the in-page editor offers to return to. */
export const CORRECTION_RETURN_PARAM = "returnTo";

/**
 * Whether a return address is a /dev task link on this site: a plain App
 * Path under /dev, never another origin, a protocol-relative URL, or a
 * backslash trick a browser would read as one.
 */
export function isEditorReturnPath(value: string | null | undefined): value is string {
  return typeof value === "string" && value.startsWith("/dev/") && !value.startsWith("//") && !/[\\\s]/.test(value);
}

/**
 * The article page with the correction context the in-page editor reads, and
 * the task link that opened it (the feedback queue with its filters and the
 * item), so the editor can go back to the same place.
 */
export function correctionHref(slug: string, feedbackId: string, section?: string | null, returnTo?: string | null): string {
  const params = new URLSearchParams({ [CORRECTION_FEEDBACK_PARAM]: feedbackId });
  if (section) params.set(CORRECTION_SECTION_PARAM, section);
  if (isEditorReturnPath(returnTo)) params.set(CORRECTION_RETURN_PARAM, returnTo);
  return `/${encodeURIComponent(slug)}?${params}`;
}

/** The task link a correction page was opened from, or null when it names none this site trusts. */
export function readCorrectionReturn(search: string): string | null {
  const value = new URLSearchParams(search).get(CORRECTION_RETURN_PARAM);
  return isEditorReturnPath(value) ? value : null;
}

/** The correction context in a page's query string, or null when it names none. */
export function readCorrectionParams(search: string): FeedbackRef | null {
  const params = new URLSearchParams(search);
  return readFeedbackRef({ id: params.get(CORRECTION_FEEDBACK_PARAM), section: params.get(CORRECTION_SECTION_PARAM) }) ?? null;
}
