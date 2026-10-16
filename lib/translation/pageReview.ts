import type { NarrativeOverlayDecision } from "./reviewTypes";

export type PageReviewState = {
  reviewed: number;
  total: number;
  latestApprovedAt: number | null;
};

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
