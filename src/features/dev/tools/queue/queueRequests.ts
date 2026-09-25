/**
 * HTTP client for the Queue tab. Reads and comments hit this ticket's routes
 * under `/api/dev/proposals`; approve, reject and revert post to the review
 * routes beneath `/api/dev/proposals/<id>/`.
 */

import type {
  ApproveOutcome,
  ProposalComment,
  ProposalDetail,
  ProposalStatus,
  ProposalSummary,
  RecommendationApproval,
  ReviewRecommendationRow,
} from "./queueModel";
import { devFetch } from "@/features/dev/tools/devFetch";

const BASE_PATH = "/api/dev/proposals";

/** A refused request, with its HTTP status so a caller can tell "gone" from "failed". */
export class QueueRequestError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "QueueRequestError";
  }
}

/** A proposal that was removed, or one the session may not open (an editor's view is their own). */
export function isMissingRecord(error: unknown): boolean {
  return error instanceof QueueRequestError && (error.status === 404 || error.status === 403);
}

export async function fetchProposals(status?: ProposalStatus): Promise<ProposalSummary[]> {
  const suffix = status ? `?status=${encodeURIComponent(status)}` : "";
  const payload = await requestJson(`${BASE_PATH}${suffix}`, undefined, {
    network: "Network error while loading the queue.",
    failure: "Unable to load the queue.",
  });
  if (!Array.isArray(payload.proposals)) {
    throw new Error("The server did not return the submission list. Refresh to try again.");
  }
  return payload.proposals as ProposalSummary[];
}

export async function fetchProposal(id: string, options: { includePayload?: boolean } = {}): Promise<ProposalDetail> {
  const suffix = options.includePayload ? "?seed=1" : "";
  const payload = await requestJson(`${BASE_PATH}/${encodeURIComponent(id)}${suffix}`, undefined, {
    network: "Network error while loading the proposal.",
    failure: "Unable to load that proposal.",
  });
  if (!payload.proposal || typeof payload.proposal !== "object") {
    throw new Error("The proposal route returned no proposal.");
  }
  return payload.proposal as ProposalDetail;
}

export async function postComment(id: string, text: string): Promise<ProposalComment> {
  const payload = await postJson(id, "comment", { text }, "Unable to post that comment.");
  return payload.comment as ProposalComment;
}

export async function approveProposal(id: string): Promise<ApproveOutcome> {
  const payload = await postJson(id, "approve", {}, "Unable to approve that proposal.");
  if (payload.status !== "applied" && payload.status !== "changes_requested") {
    throw new Error("The server did not confirm approval. Refresh to check the submission before trying again.");
  }
  return {
    status: payload.status,
    ...(typeof payload.conflictReason === "string" ? { conflictReason: payload.conflictReason } : {}),
  };
}

export async function rejectProposal(id: string, note: string): Promise<void> {
  await postJson(id, "reject", { note }, "Unable to reject that proposal.");
}

export async function revertProposal(id: string): Promise<void> {
  await postJson(id, "revert", {}, "Unable to revert that proposal.");
}

const RECOMMENDATIONS_PATH = "/api/dev/review-recommendations";

/** Every editor recommendation awaiting an admin, with whether each is stale. */
export async function fetchReviewRecommendations(): Promise<ReviewRecommendationRow[]> {
  const payload = await requestJson(RECOMMENDATIONS_PATH, undefined, {
    network: "Network error while loading review recommendations.",
    failure: "Unable to load review recommendations.",
  });
  if (!Array.isArray(payload.recommendations)) {
    throw new Error("The server did not return the recommendation list. Refresh to try again.");
  }
  return payload.recommendations as ReviewRecommendationRow[];
}

/** Approves each recommendation at the revision it covered; stale or changed ones come back unapproved. */
export async function approveReviewRecommendations(
  items: ReadonlyArray<{ slug: string; revision: string }>,
): Promise<RecommendationApproval> {
  const payload = await requestJson(
    RECOMMENDATIONS_PATH,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items }) },
    { network: "Network error while approving recommendations.", failure: "Unable to approve those recommendations." },
  );
  const list = (value: unknown) =>
    Array.isArray(value) ? value.filter((slug): slug is string => typeof slug === "string") : null;
  const approved = list(payload.approved);
  const stale = list(payload.stale);
  const missing = list(payload.missing);
  if (!approved || !stale || !missing) {
    throw new Error("The server did not confirm the approval. Refresh to check the recommendations before trying again.");
  }
  return { approved, stale, missing };
}

async function postJson(
  id: string,
  action: string,
  body: Record<string, unknown>,
  failure: string,
): Promise<Record<string, unknown>> {
  return requestJson(
    `${BASE_PATH}/${encodeURIComponent(id)}/${action}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
    { network: "Network error while updating the proposal.", failure },
  );
}

function requestJson(
  url: string,
  init: RequestInit | undefined,
  messages: { network: string; failure: string },
) {
  return devFetch(url, {
    ...init,
    messages: { ...messages, unreadable: "The server returned an unreadable response. Refresh to check the latest status." },
    onError: (status, _payload, message) => new QueueRequestError(message, status),
  });
}
