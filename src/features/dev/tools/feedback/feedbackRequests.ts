import { FEEDBACK_QUEUE_WINDOW, type FeedbackTransitionInput } from "./FeedbackReviewQueue";

type FeedbackRequests<Item> = {
  fetchList: () => Promise<Item[]>;
  transition: (id: string, input: FeedbackTransitionInput) => Promise<Item>;
};

const FEEDBACK_STATUSES = new Set(["new", "reviewing", "resolved", "rejected", "spam"]);

/**
 * HTTP client for one feedback source. Both sources expose the same
 * `GET {basePath}/queue?limit=` and `POST {basePath}/{id}/status` routes.
 * The list is one request for the newest rows of every status; the queue
 * filters and counts them itself.
 *
 * A successful response that does not carry the expected shape is an error,
 * never an empty queue: the queue keeps the rows it already has and offers
 * a retry, so a broken contract cannot read as "no feedback".
 */
export function createFeedbackRequests<Item>(
  basePath: string,
  options: { listUrl?: string } = {},
): FeedbackRequests<Item> {
  return {
    async fetchList() {
      const payload = await requestJson(
        options.listUrl ?? `${basePath}/queue?limit=${FEEDBACK_QUEUE_WINDOW}`,
        { cache: "no-store" },
        {
          network: "Network error while loading feedback.",
          failure: "Unable to load feedback.",
        },
      );
      return readFeedbackList<Item>(payload);
    },
    async transition(id, input) {
      const payload = await requestJson(
        `${basePath}/${encodeURIComponent(id)}/status`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        },
        {
          network: "Network error while updating the feedback.",
          failure: "Unable to update feedback.",
        },
      );
      if (!isFeedbackRow(payload.feedback)) {
        throw new Error("The server did not confirm the decision. Refresh to check the feedback before trying again.");
      }
      return payload.feedback as Item;
    },
  };
}

/** The `feedback` array of a list response, or a retryable error when it is missing or malformed. */
export function readFeedbackList<Item>(payload: Record<string, unknown>): Item[] {
  if (!Array.isArray(payload.feedback) || !payload.feedback.every(isFeedbackRow)) {
    throw new Error("The server did not return the feedback list. Try again.");
  }
  return payload.feedback as Item[];
}

function isFeedbackRow(value: unknown): boolean {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const row = value as Record<string, unknown>;
  return typeof row.id === "string" && typeof row.status === "string" && FEEDBACK_STATUSES.has(row.status);
}

async function requestJson(
  url: string,
  init: RequestInit,
  messages: { network: string; failure: string },
): Promise<Record<string, unknown>> {
  let response: Response;
  try {
    response = await fetch(url, init);
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
    throw new Error("The server returned an unreadable response. Try again.");
  }
  return record;
}
