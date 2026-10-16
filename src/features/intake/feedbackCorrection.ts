import type { IntakeStatus } from "./intakeStatus";
import type { DecisionLogEntry } from "./decisionLog";

export const FEEDBACK_OUTCOMES = ["duplicate", "explanation_provided", "no_change_needed"] as const;

export type FeedbackOutcome = (typeof FEEDBACK_OUTCOMES)[number];

export const FEEDBACK_OUTCOME_LABEL: Record<FeedbackOutcome, string> = {
  duplicate: "Duplicate",
  explanation_provided: "Explanation provided",
  no_change_needed: "No change needed",
};

export const FEEDBACK_OUTCOME_STATUS = {
  duplicate: "resolved",
  explanation_provided: "resolved",
  no_change_needed: "rejected",
} as const satisfies Record<FeedbackOutcome, IntakeStatus>;

export function isFeedbackOutcome(value: unknown): value is FeedbackOutcome {
  return typeof value === "string" && (FEEDBACK_OUTCOMES as readonly string[]).includes(value);
}

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

export type FeedbackRef = { id: string; section?: string };

export function readFeedbackRef(value: unknown): FeedbackRef | undefined {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const id = typeof record.id === "string" ? record.id.trim() : "";
  if (!id || id.length > 200 || !/^[A-Za-z0-9_-]+$/.test(id)) return undefined;
  const section = typeof record.section === "string" && /^[a-z_]{1,40}$/.test(record.section) ? record.section : undefined;
  return section ? { id, section } : { id };
}

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

export type CorrectionProposal = { id: string; status: string; summary: string; createdAt: string };

export type CorrectionRevision = { id: string; summary: string; createdAt: string };

export type ResolvedCorrection = {
  change: LinkedChange;
  linkedAt: string;
  state: CorrectionState;
  proposal?: CorrectionProposal;
  revisedFrom?: string;
  revision?: CorrectionRevision;
};

export type CorrectionCandidates = { proposals: CorrectionProposal[]; revisions: CorrectionRevision[] };

type ProposalFacts = { _id: string; status: string; summary: string; createdAt: string; revisionOf?: string };
type RevisionFacts = { _id: string; changeId: string; summary: string; createdAt: string; restoredFrom?: string };

const MAX_REVISION_HOPS = 20;

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

export const CORRECTION_FEEDBACK_PARAM = "feedback";
export const CORRECTION_SECTION_PARAM = "section";

export const CORRECTION_RETURN_PARAM = "returnTo";

export function isEditorReturnPath(value: string | null | undefined): value is string {
  return typeof value === "string" && value.startsWith("/dev/") && !value.startsWith("//") && !/[\\\s]/.test(value);
}

export function correctionHref(slug: string, feedbackId: string, section?: string | null, returnTo?: string | null): string {
  const params = new URLSearchParams({ [CORRECTION_FEEDBACK_PARAM]: feedbackId });
  if (section) params.set(CORRECTION_SECTION_PARAM, section);
  if (isEditorReturnPath(returnTo)) params.set(CORRECTION_RETURN_PARAM, returnTo);
  return `/${encodeURIComponent(slug)}?${params}`;
}

export function readCorrectionReturn(search: string): string | null {
  const value = new URLSearchParams(search).get(CORRECTION_RETURN_PARAM);
  return isEditorReturnPath(value) ? value : null;
}

export function readCorrectionParams(search: string): FeedbackRef | null {
  const params = new URLSearchParams(search);
  return readFeedbackRef({ id: params.get(CORRECTION_FEEDBACK_PARAM), section: params.get(CORRECTION_SECTION_PARAM) }) ?? null;
}
