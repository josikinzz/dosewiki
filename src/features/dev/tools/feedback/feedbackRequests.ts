import { FEEDBACK_QUEUE_WINDOW, type FeedbackTransitionInput } from "./FeedbackReviewQueue";

type FeedbackRequests<Item> = {
  fetchList: () => Promise<Item[]>;
  transition: (id: string, input: FeedbackTransitionInput) => Promise<Item>;
};

/**
 * HTTP client for one feedback source. Both sources expose the same
 * `GET {basePath}/queue?limit=` and `POST {basePath}/{id}/status` routes.
 * The list is one request for the newest rows of every status; the queue
 * filters and counts them itself.
 */
export function createFeedbackRequests<Item>(basePath: string): FeedbackRequests<Item> {
  return {
    async fetchList() {
      const payload = await requestJson(`${basePath}/queue?limit=${FEEDBACK_QUEUE_WINDOW}`, undefined, {
        network: "Network error while loading feedback.",
        failure: "Unable to load feedback.",
      });
      return Array.isArray(payload.feedback) ? (payload.feedback as Item[]) : [];
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
      return payload.feedback as Item;
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
