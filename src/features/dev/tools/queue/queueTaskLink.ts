import { devHref } from "@/utils/devHref";

import type { ProposalSummary } from "./queueModel";

export const QUEUE_VIEW_PARAM = "view";
export const RECOMMENDATION_PARAM = "recommendation";

export type QueueView = "mine";

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
