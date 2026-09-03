import type { FeedbackQueueFilter, FeedbackTransitionInput } from "./FeedbackReviewQueue";

type FeedbackRequests<Item> = {
  fetchList: (filter: FeedbackQueueFilter) => Promise<Item[]>;
  transition: (id: string, input: FeedbackTransitionInput) => Promise<void>;
};

/**
 * HTTP client for one feedback source. Both sources expose the same
 * `GET {basePath}/queue?status=` and `POST {basePath}/{id}/status` routes.
 */
export function createFeedbackRequests<Item>(basePath: string): FeedbackRequests<Item> {
  return {
    async fetchList(filter) {
      const suffix = filter === "all" ? "" : `?status=${encodeURIComponent(filter)}`;
      const payload = await requestJson(`${basePath}/queue${suffix}`, undefined, {
        network: "Network error while loading feedback.",
        failure: "Unable to load feedback.",
      });
      return Array.isArray(payload.feedback) ? (payload.feedback as Item[]) : [];
    },
    async transition(id, input) {
      await requestJson(
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
    },
  };
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

  const payload: Record<string, unknown> = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(typeof payload.error === "string" ? payload.error : messages.failure);
  }
  return payload;
}
