import { v } from "../../lib/postgres/runtime/values";
import type { QueryCtx } from "../../lib/postgres/runtime/server";
import type { Doc } from "../../lib/postgres/runtime/dbRows";
import type {
  FeedbackQueueOrder,
  FeedbackQueueStatusCounts,
  FeedbackQueueTable,
} from "../../lib/postgres/runtime/feedbackQueuePage";

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

export async function readFeedbackQueue(
  ctx: { db: QueryCtx["db"] },
  table: FeedbackQueueTable,
  args: { status?: string; search?: string; order?: FeedbackQueueOrder; cursor?: string; limit?: number },
): Promise<{ rows: Doc[]; nextCursor: string | null; counts: FeedbackQueueStatusCounts }> {
  const [page, counts] = await Promise.all([
    ctx.db.getFeedbackQueuePage(table, {
      status: args.status,
      search: args.search,
      order: args.order ?? "oldest",
      cursor: args.cursor ?? null,
      limit: args.limit ?? 100,
    }),
    ctx.db.getFeedbackQueueCounts(table, args.search),
  ]);
  return { ...page, counts };
}
