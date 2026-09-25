import { v } from "../../lib/postgres/runtime/values";
import type { QueryCtx } from "../../lib/postgres/runtime/server";
import type { Doc } from "../../lib/postgres/runtime/dbRows";
import type {
  FeedbackQueueOrder,
  FeedbackQueuePageOptions,
  FeedbackQueueStatusCounts,
  FeedbackQueueTable,
} from "../../lib/postgres/runtime/feedbackQueuePage";

/** Shared arguments and result of the article and site `queuePage` reads. */
export const feedbackQueueOrderValidator = v.union(
  v.literal("oldest"),
  v.literal("newest"),
  v.literal("importance"),
);

export const feedbackQueueCountsValidator = v.object({
  new: v.number(),
  reviewing: v.number(),
  resolved: v.number(),
  rejected: v.number(),
  spam: v.number(),
});

type FeedbackQueueReader = QueryCtx["db"] & {
  getFeedbackQueuePage: (
    table: FeedbackQueueTable,
    options: FeedbackQueuePageOptions,
  ) => Promise<{ rows: Doc[]; nextCursor: string | null }>;
  getFeedbackQueueCounts: (table: FeedbackQueueTable, search: string | undefined) => Promise<FeedbackQueueStatusCounts>;
};

/**
 * One page of a feedback queue plus the per-status counts of every row the
 * search matches, so the queue can show how many match apart from how many
 * it has loaded.
 */
export async function readFeedbackQueue(
  ctx: { db: QueryCtx["db"] },
  table: FeedbackQueueTable,
  args: { status?: string; search?: string; order?: FeedbackQueueOrder; cursor?: string; limit?: number },
): Promise<{ rows: Doc[]; nextCursor: string | null; counts: FeedbackQueueStatusCounts }> {
  const reader = ctx.db as FeedbackQueueReader;
  const [page, counts] = await Promise.all([
    reader.getFeedbackQueuePage(table, {
      status: args.status,
      search: args.search,
      order: args.order ?? "oldest",
      cursor: args.cursor ?? null,
      limit: args.limit ?? 100,
    }),
    reader.getFeedbackQueueCounts(table, args.search),
  ]);
  return { ...page, counts };
}
