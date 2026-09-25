/**
 * Change Review's task links and its one saved view.
 *
 *   /dev/queue/<proposal id>                 one proposal
 *   /dev/queue/<proposal id>?view=mine       the same, inside My pending proposals
 *   /dev/queue?recommendation=<article slug> one review recommendation in its lane
 *
 * Only ids, slugs and the view name go in the address.
 */

import { devHref } from "@/utils/devHref";

import type { ProposalSummary } from "./queueModel";

export const QUEUE_VIEW_PARAM = "view";
export const RECOMMENDATION_PARAM = "recommendation";

/** The saved views Change Review offers; `mine` is My pending proposals. */
export type QueueView = "mine";

/**
 * My pending proposals: the session's own proposals still waiting on a
 * decision or a revision. The tab lists these rows and the palette counts
 * them from the same proposal list, so the count always equals the rows.
 */
export function isMyPendingProposal(row: Pick<ProposalSummary, "isAuthor" | "status">): boolean {
  return row.isAuthor && (row.status === "submitted" || row.status === "changes_requested");
}

export function proposalTaskHref(id: string | null, view: QueueView | null = null): string {
  const base = devHref({ type: "dev", tab: "queue", slug: id ? encodeURIComponent(id) : undefined });
  return view ? `${base}?${QUEUE_VIEW_PARAM}=${view}` : base;
}

export function reviewRecommendationHref(slug: string): string {
  return `${devHref({ type: "dev", tab: "queue" })}?${new URLSearchParams({ [RECOMMENDATION_PARAM]: slug })}`;
}

export function readQueueTaskParams(search: string): { view: QueueView | null; recommendation: string | null } {
  const params = new URLSearchParams(search);
  const recommendation = params.get(RECOMMENDATION_PARAM)?.trim();
  return {
    view: params.get(QUEUE_VIEW_PARAM) === "mine" ? "mine" : null,
    recommendation: recommendation ? recommendation : null,
  };
}
