/** Shared, browser-safe contracts for human translation review. */
import type { ReviewReason } from "./reviewReason";
/**
 * `qa-exception` holds a reviewer's "Fine here" on an Inbox QA finding: an
 * approved snapshot keyed by the finding, segment hash, term, and glossary
 * revision, so the finding returns only when one of those changes.
 *
 * `model-suggestion` holds a model fluency suggestion for one article sentence
 * as a draft until a person accepts it; see `lib/translation/fluencyReview.ts`.
 * Accepting approves the suggestion entry (resolved) and saves a `narrative`
 * draft; it never approves a translation.
 */
/** `note` holds translator's notes: locale-only text under an article section, never a translation of English. */
/** `style-guide` holds one document per locale: translator rules and example corrections the prompt reads once approved. */
export type ReviewScope = "ui" | "glossary" | "narrative" | "qa-exception" | "note" | "model-suggestion" | "style-guide";
export type ReviewSnapshot = { source: string; target: string; context: string; provenance?: "compiled" | "human" };
export type ReviewState = { revision: number; draft: ReviewSnapshot | null; approved: ReviewSnapshot | null };
export type ReviewEntry = ReviewState & { locale: string; scope: ReviewScope; sourceId: string; updatedAt: number };
export type ReviewAction = "save" | "approve" | "restore";
/**
 * How a stored narrative approval meets the current English. `apply` shows the human target.
 * `apply-recheck` also shows it, but a neighbouring sentence changed, so a person must re-check
 * it and it does not count as reviewed. `stale` falls back to machine output.
 */
export type NarrativeOverlayDecision = "apply" | "apply-recheck" | "stale";
/** Decisions that put the human target on the page. `apply-recheck` still counts as not reviewed. */
export function narrativeOverlayApplies(decision: NarrativeOverlayDecision | null | undefined): decision is "apply" | "apply-recheck" {
  return decision === "apply" || decision === "apply-recheck";
}
/** Row state in the Narratives view. `recheck` is an approval in `apply-recheck`. */
export type NarrativeRowStatus = "unreviewed" | "draft" | "approved" | "recheck" | "stale";
export type ReviewHistoryEntry = {
  revision: number;
  action: ReviewAction;
  before: ReviewState;
  after: ReviewState;
  actor: string;
  /** Legacy free-text reasons read as `{ kind: "unspecified", note }`. */
  reason: ReviewReason;
  /** Approved glossary terms the reviewer kept out of this wording on purpose ("Fine here"). */
  glossaryExceptions: string[];
  createdAt: number;
};
export type ReviewMutation = {
  locale: string;
  scope: ReviewScope;
  sourceId: string;
  expectedRevision: number;
  action: ReviewAction;
  source: string;
  context: string;
  target?: string;
  restoreRevision?: number;
  actor: string;
  /** A plain string is recorded as an unspecified reason, as before. */
  reason: ReviewReason | string;
  /** Recorded with the reason; the caller has already run the glossary check. */
  glossaryExceptions?: readonly string[];
};
