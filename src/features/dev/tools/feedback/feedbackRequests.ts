import type { FeedbackImportance, FeedbackQueueItem, FeedbackTransitionInput } from "./FeedbackReviewQueue";
import {
  FEEDBACK_PAGE_SIZE,
  QUEUE_STATUSES,
  pageLocally,
  type FeedbackPage,
  type FeedbackPageQuery,
  type StatusCounts,
} from "./feedbackQueueModel";

type FeedbackRequests<Item> = {
  fetchPage: (query: FeedbackPageQuery) => Promise<FeedbackPage<Item>>;
  transition: (id: string, input: FeedbackTransitionInput) => Promise<Item>;
};

const FEEDBACK_STATUSES = new Set<string>(QUEUE_STATUSES);

const LIST_MESSAGES = {
  network: "Network error while loading feedback.",
  failure: "Unable to load feedback.",
};

/**
 * HTTP client for one feedback source. Article and site feedback expose
 * `GET {basePath}/queue?status=&q=&order=&cursor=&limit=`, which filters,
 * searches, orders and pages on the server, and `POST {basePath}/{id}/status`.
 * A source whose queue route returns its whole list (`listUrl`) is paged in
 * the browser under the same contract.
 *
 * A successful response that does not carry the expected shape is an error,
 * never an empty queue: the queue keeps the rows it already has and offers
 * a retry, so a broken contract cannot read as "no feedback".
 */
export function createFeedbackRequests<Item extends FeedbackQueueItem>(
  basePath: string,
  options: {
    listUrl?: string;
    importance?: (item: Item) => FeedbackImportance | null | undefined;
  } = {},
): FeedbackRequests<Item> {
  return {
    async fetchPage(query) {
      if (options.listUrl) {
        const payload = await requestJson(options.listUrl, { cache: "no-store" }, LIST_MESSAGES);
        return pageLocally(readFeedbackList<Item>(payload), query, options.importance);
      }

      const params = new URLSearchParams({ status: query.status, order: query.sort, limit: String(FEEDBACK_PAGE_SIZE) });
      if (query.search.trim()) {
        params.set("q", query.search.trim());
      }
      if (query.cursor) {
        params.set("cursor", query.cursor);
      }
      const payload = await requestJson(`${basePath}/queue?${params}`, { cache: "no-store" }, LIST_MESSAGES);
      return {
        rows: readFeedbackList<Item>(payload),
        counts: readCounts(payload.counts),
        nextCursor: readCursor(payload.nextCursor),
      };
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

const MALFORMED_LIST = "The server did not return the feedback list. Try again.";

/** The `feedback` array of a list response, or a retryable error when it is missing or malformed. */
export function readFeedbackList<Item>(payload: Record<string, unknown>): Item[] {
  if (!Array.isArray(payload.feedback) || !payload.feedback.every(isFeedbackRow)) {
    throw new Error(MALFORMED_LIST);
  }
  return payload.feedback as Item[];
}

function readCounts(value: unknown): StatusCounts {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(MALFORMED_LIST);
  }
  const record = value as Record<string, unknown>;
  const counts = {} as StatusCounts;
  for (const status of QUEUE_STATUSES) {
    const count = record[status];
    if (typeof count !== "number" || !Number.isInteger(count) || count < 0) {
      throw new Error(MALFORMED_LIST);
    }
    counts[status] = count;
  }
  return counts;
}

function readCursor(value: unknown): string | null {
  if (value === null || (typeof value === "string" && value.length > 0)) {
    return value;
  }
  throw new Error(MALFORMED_LIST);
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
