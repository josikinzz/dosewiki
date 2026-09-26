/**
 * HTTP client for the Queue tab. Reads and comments hit this ticket's routes
 * under `/api/dev/proposals`; approve, reject and revert post to the review
 * routes beneath `/api/dev/proposals/<id>/`.
 */

import type {
  ApproveOutcome,
  ProposalComment,
  ProposalClaim,
  ProposalDetail,
  ProposalStatus,
  ProposalSummary,
  RecommendationApproval,
  ReviewRecommendationRow,
} from "./queueModel";
import { isWriteFreezeRefusal } from "@/features/dev/components/writeFreeze";
import { devFetch } from "@/features/dev/tools/devFetch";

const BASE_PATH = "/api/dev/proposals";

/** A refused request, with its HTTP status so a caller can tell "gone" from "failed". */
export class QueueRequestError extends Error {
  constructor(message: string, readonly status: number, readonly frozen = false) {
    super(message);
    this.name = "QueueRequestError";
  }
}

/** A proposal that was removed, or one the session may not open (an editor's view is their own). */
export function isMissingRecord(error: unknown): boolean {
  return error instanceof QueueRequestError && (error.status === 404 || error.status === 403);
}

/** The server's write freeze (`DATA_WRITES_FROZEN`): a 503, or a message that names it. */
export function isWriteFreezeError(error: unknown): boolean {
  if (error instanceof QueueRequestError && error.frozen) return true;
  return error instanceof Error && /DATA_WRITES_FROZEN|writes are (?:frozen|paused)/i.test(error.message);
}

export const QUEUE_FREEZE_COPY = "Writes are paused, so that was not saved. Try again once they resume.";

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

const CLAIMS_PATH = "/api/dev/inbox/claims";

/**
 * Who holds each waiting proposal, from the Inbox's claim table (admin only),
 * keyed by proposal id. Claims are advisory: they tell admins who is already
 * reviewing, and never gate a decision.
 */
export async function fetchProposalClaims(): Promise<Map<string, ProposalClaim>> {
  const payload = await requestJson(CLAIMS_PATH, undefined, {
    network: "Network error while loading who is reviewing what.",
    failure: "Unable to load who is reviewing what.",
  });
  if (!Array.isArray(payload.claims)) {
    throw new Error("The server did not return the claims.");
  }
  const claims = new Map<string, ProposalClaim>();
  for (const entry of payload.claims as Array<Record<string, unknown>>) {
    if (entry?.source !== "proposals" || typeof entry.item_id !== "string" || typeof entry.claimed_by !== "string") continue;
    claims.set(entry.item_id, {
      claimed_by: entry.claimed_by,
      claimed_at: typeof entry.claimed_at === "string" ? entry.claimed_at : null,
      expired: entry.expired === true,
    });
  }
  return claims;
}

/** Claims or releases a waiting proposal through the same route the Inbox uses. */
export async function writeProposalClaim(id: string, action: "claim" | "release"): Promise<ProposalClaim | null> {
  const payload = await requestJson(
    CLAIMS_PATH,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, source: "proposals", id }) },
    { network: "Network error while updating the claim.", failure: action === "claim" ? "Unable to claim that proposal." : "Unable to release that proposal." },
  );
  if (action === "release") return null;
  const claim = payload.claim as Record<string, unknown> | undefined;
  if (!claim || typeof claim.claimed_by !== "string") {
    throw new Error("The server did not confirm the claim. Refresh to check who holds this proposal.");
  }
  return { claimed_by: claim.claimed_by, claimed_at: typeof claim.claimed_at === "string" ? claim.claimed_at : null, expired: false };
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
    onError: (status, payload, message) => new QueueRequestError(message, status, isWriteFreezeRefusal(status, payload)),
  });
}
