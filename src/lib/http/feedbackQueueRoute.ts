import { NextResponse } from "next/server";

import { protectedRouteOperation } from "@/lib/http/protectedRouteOperation";

export const FEEDBACK_QUEUE_ORDERS = ["oldest", "newest", "importance"] as const;
export type FeedbackQueueOrder = (typeof FEEDBACK_QUEUE_ORDERS)[number];

export type FeedbackQueueCounts = {
  new: number;
  reviewing: number;
  resolved: number;
  rejected: number;
  spam: number;
};

/** New and Reviewing together: every item still waiting on a decision. */
export const FEEDBACK_QUEUE_UNRESOLVED = "unresolved";

export type FeedbackQueuePageFilters<Status extends string> = {
  status?: Status | typeof FEEDBACK_QUEUE_UNRESOLVED;
  search?: string;
  order: FeedbackQueueOrder;
  cursor?: string;
  limit: number;
};

export type FeedbackQueuePageResult<Item> = {
  feedback: Item[];
  nextCursor: string | null;
  counts: FeedbackQueueCounts;
};

type FeedbackQueueStore<Status extends string> = {
  page(filters: FeedbackQueuePageFilters<Status>): Promise<FeedbackQueuePageResult<unknown>>;
};

export type FeedbackQueueRouteOptions<Status extends string> = {
  isStatus: (value: unknown) => value is Status;
  getStore: () => Promise<FeedbackQueueStore<Status>>;
  /** Thrown by the store factory when storage is unconfigured; mapped to 503. */
  StorageConfigurationError: abstract new (...args: never[]) => Error;
  /** "article" or "site", for the 400 messages. */
  sourceLabel: string;
  unexpectedErrorLabel: string;
  unexpectedErrorMessage: string;
};

const DEFAULT_PAGE = 100;
const MAX_PAGE = 250;
const MAX_SEARCH_LENGTH = 200;
const MAX_CURSOR_LENGTH = 1024;

class InvalidQueueRequestError extends Error {}

/**
 * Editor read of one feedback queue page.
 *
 *   GET {base}/queue?status=&q=&order=&cursor=&limit=
 *     → { ok, feedback, nextCursor, counts, total }
 *
 * Status and search apply on the server, so a row is reachable however many
 * newer rows sit above it. `status=unresolved` lists New and Reviewing
 * together, the rows still waiting on a decision. `order` defaults to oldest first, the order for
 * clearing unresolved work. `counts` holds every status among the rows the
 * search matches; `total` is how many match the status too, which the queue
 * shows apart from how many it has loaded. `nextCursor` continues the same
 * query and order; it is null on the last page.
 */
export function feedbackQueueRoute<Status extends string>(options: FeedbackQueueRouteOptions<Status>) {
  return protectedRouteOperation({
    auth: "editor",
    rateLimit: "diagnosticRead",
    unexpectedErrorLabel: options.unexpectedErrorLabel,
    unexpectedErrorMessage: options.unexpectedErrorMessage,
    mapError: (error) => {
      if (error instanceof InvalidQueueRequestError) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
      if (error instanceof Error && error.message.includes("Invalid feedback queue cursor")) {
        return NextResponse.json(
          { error: "That page of the queue is no longer valid. Reload the queue." },
          { status: 400 },
        );
      }
      if (error instanceof options.StorageConfigurationError) {
        return NextResponse.json({ error: error.message }, { status: 503 });
      }
      return null;
    },
    operation: async ({ request }) => {
      const filters = parseFilters(new URL(request.url).searchParams, options);
      const store = await options.getStore();
      const page = await store.page(filters);
      const total = filters.status === FEEDBACK_QUEUE_UNRESOLVED
        ? page.counts.new + page.counts.reviewing
        : filters.status
          ? page.counts[filters.status as keyof FeedbackQueueCounts] ?? 0
          : Object.values(page.counts).reduce((sum, count) => sum + count, 0);

      return NextResponse.json({ ok: true, ...page, total });
    },
  });
}

function parseFilters<Status extends string>(
  params: URLSearchParams,
  options: FeedbackQueueRouteOptions<Status>,
): FeedbackQueuePageFilters<Status> {
  const status = params.get("status");
  if (status && status !== "all" && status !== FEEDBACK_QUEUE_UNRESOLVED && !options.isStatus(status)) {
    throw new InvalidQueueRequestError(`Unknown ${options.sourceLabel} feedback status: ${status}`);
  }

  const order = params.get("order") ?? "oldest";
  if (!(FEEDBACK_QUEUE_ORDERS as readonly string[]).includes(order)) {
    throw new InvalidQueueRequestError(`Unknown queue order: ${order}`);
  }

  const search = params.get("q")?.trim() ?? "";
  if (search.length > MAX_SEARCH_LENGTH) {
    throw new InvalidQueueRequestError(`Search text is limited to ${MAX_SEARCH_LENGTH} characters.`);
  }

  const cursor = params.get("cursor") ?? "";
  if (cursor.length > MAX_CURSOR_LENGTH || /[^A-Za-z0-9_-]/.test(cursor)) {
    throw new InvalidQueueRequestError("That page of the queue is no longer valid. Reload the queue.");
  }

  const parsedLimit = Number.parseInt(params.get("limit") ?? "", 10);
  const limit = Number.isFinite(parsedLimit) ? Math.max(1, Math.min(parsedLimit, MAX_PAGE)) : DEFAULT_PAGE;

  return {
    ...(status && status !== "all" ? { status: status as Status | typeof FEEDBACK_QUEUE_UNRESOLVED } : {}),
    ...(search ? { search } : {}),
    order: order as FeedbackQueueOrder,
    ...(cursor ? { cursor } : {}),
    limit,
  };
}
