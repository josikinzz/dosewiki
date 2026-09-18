/**
 * HTTP client for the Queue tab. Reads and comments hit this ticket's routes
 * under `/api/dev/proposals`; approve, reject and revert post to the review
 * routes beneath `/api/dev/proposals/<id>/`.
 */

import type { ApproveOutcome, ProposalComment, ProposalDetail, ProposalStatus, ProposalSummary } from "./queueModel";

const BASE_PATH = "/api/dev/proposals";

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

async function requestJson(
  url: string,
  init: RequestInit | undefined,
  messages: { network: string; failure: string },
): Promise<Record<string, unknown>> {
  let response: Response;
  try {
    response = init ? await fetch(url, init) : await fetch(url);
  } catch {
    throw new Error(messages.network);
  }

  const payload: unknown = await response.json().catch(() => null);
  const record = payload !== null && typeof payload === "object" && !Array.isArray(payload)
    ? payload as Record<string, unknown>
    : null;
  if (!response.ok) {
    throw new Error(typeof record?.error === "string" ? record.error : messages.failure);
  }
  if (!record) {
    throw new Error("The server returned an unreadable response. Refresh to check the latest status.");
  }
  return record;
}
