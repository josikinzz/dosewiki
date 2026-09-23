/**
 * Page review state for a localized article, derived from the narrative
 * overlay at render. Browser-safe: the public notice reads the result, never
 * the review tables, and no reviewer identity is part of it.
 */
import type { NarrativeOverlayDecision } from "./reviewTypes";

export type PageReviewState = {
  /** Paragraphs whose human approval matches the current English. */
  reviewed: number;
  /** Every translatable paragraph on the page. */
  total: number;
  /** Epoch ms of the latest approval among the reviewed paragraphs. */
  latestApprovedAt: number | null;
};

/**
 * Only `apply` counts as reviewed. `apply-recheck` still shows the human text,
 * but a neighbouring sentence changed and a person has not looked again.
 * `approvedAt` aligns with `decisions`.
 */
export function pageReviewState(
  decisions: readonly (NarrativeOverlayDecision | null)[],
  approvedAt: readonly (number | null)[],
): PageReviewState {
  let reviewed = 0;
  let latestApprovedAt: number | null = null;
  decisions.forEach((decision, index) => {
    if (decision !== "apply") return;
    reviewed += 1;
    const at = approvedAt[index];
    if (at !== null && at !== undefined && (latestApprovedAt === null || at > latestApprovedAt)) latestApprovedAt = at;
  });
  return { reviewed, total: decisions.length, latestApprovedAt };
}

export function isFullyReviewed(state: PageReviewState): boolean {
  return state.total > 0 && state.reviewed === state.total;
}
