import type { ReviewReason } from "./reviewReason";
export type ReviewScope = "ui" | "glossary" | "narrative" | "qa-exception" | "note" | "model-suggestion" | "style-guide";
export type ReviewSnapshot = { source: string; target: string; context: string; provenance?: "compiled" | "human" };
export type ReviewState = { revision: number; draft: ReviewSnapshot | null; approved: ReviewSnapshot | null };
export type ReviewEntry = ReviewState & { locale: string; scope: ReviewScope; sourceId: string; updatedAt: number };
export type ReviewAction = "save" | "approve" | "restore";
export type NarrativeOverlayDecision = "apply" | "apply-recheck" | "stale";
export function narrativeOverlayApplies(decision: NarrativeOverlayDecision | null | undefined): decision is "apply" | "apply-recheck" {
  return decision === "apply" || decision === "apply-recheck";
}
export type NarrativeRowStatus = "unreviewed" | "draft" | "approved" | "recheck" | "stale";
export type ReviewHistoryEntry = {
  revision: number;
  action: ReviewAction;
  before: ReviewState;
  after: ReviewState;
  actor: string;
  reason: ReviewReason;
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
  reason: ReviewReason | string;
  glossaryExceptions?: readonly string[];
};
