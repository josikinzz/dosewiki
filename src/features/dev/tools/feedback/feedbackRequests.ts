import type { FeedbackImportance, FeedbackQueueItem, FeedbackTransitionInput } from "./FeedbackReviewQueue";
import {
  FEEDBACK_PAGE_SIZE,
  QUEUE_STATUSES,
  looksLikeContactDetails,
  pageLocally,
  type FeedbackPage,
  type FeedbackPageQuery,
  type StatusCounts,
} from "./feedbackQueueModel";
import { devFetch } from "@/features/dev/tools/devFetch";

type FeedbackRequests<Item> = {
  fetchPage: (query: FeedbackPageQuery) => Promise<FeedbackPage<Item>>;
  fetchItem: (id: string) => Promise<Item | null>;
  transition: (id: string, input: FeedbackTransitionInput) => Promise<Item>;
};

const FEEDBACK_STATUSES = new Set<string>(QUEUE_STATUSES);

const LIST_MESSAGES = {
  network: "Network error while loading feedback.",
  failure: "Unable to load feedback.",
};

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
      if (query.search.trim() && !looksLikeContactDetails(query.search)) {
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
    async fetchItem(id) {
      if (options.listUrl) {
        const payload = await requestJson(options.listUrl, { cache: "no-store" }, LIST_MESSAGES);
        return readFeedbackList<Item>(payload).find((row) => row.id === id) ?? null;
      }
      let record: Record<string, unknown>;
      try {
        record = await devFetch(`${basePath}/${encodeURIComponent(id)}`, {
          cache: "no-store",
          messages: {
            network: "Network error while opening the feedback.",
            failure: "Unable to open that feedback.",
          },
          onError: (status) => (status === 404 || status === 403 ? new FeedbackItemMissing() : undefined),
        });
      } catch (error) {
        if (error instanceof FeedbackItemMissing) {
          return null;
        }
        throw error;
      }
      if (!isFeedbackRow(record.feedback)) {
        throw new Error("The server did not return the feedback. Try again.");
      }
      return record.feedback as Item;
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

class FeedbackItemMissing extends Error {}

const MALFORMED_LIST = "The server did not return the feedback list. Try again.";

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

function requestJson(url: string, init: RequestInit, messages: { network: string; failure: string }) {
  return devFetch(url, { ...init, messages });
}
