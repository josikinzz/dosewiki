import type { FeedbackImportance, FeedbackQueueItem } from "@/features/dev/tools/feedback/FeedbackReviewQueue";
import { isFeedbackQueueFilter } from "@/features/dev/tools/feedback/FeedbackReviewQueue";
import { pageLocally, totalFor, type QueueSort } from "@/features/dev/tools/feedback/feedbackQueueModel";

type Row = Record<string, unknown> & { id: string };

/**
 * A stand-in for `GET /api/{article,site}-feedback/queue` in tool tests: it
 * applies `status`, `q`, `order`, `cursor` and `limit` to `rows` the way the
 * route contract does and answers with `{ ok, feedback, counts, nextCursor, total }`.
 */
export function queueResponse(input: RequestInfo | URL, rows: readonly Row[]): Response {
  const params = new URL(String(input), "https://dose.wiki").searchParams;
  const status = params.get("status") ?? "all";
  const order = (params.get("order") ?? "oldest") as QueueSort;
  const filter = isFeedbackQueueFilter(status) ? status : "all";
  const page = pageLocally(
    rows as unknown as FeedbackQueueItem[],
    { status: filter, search: params.get("q") ?? "", sort: order, cursor: params.get("cursor") },
    (row) => ((row as unknown as Row).importance ?? (row as unknown as Row).urgency) as FeedbackImportance | undefined,
    Number(params.get("limit") ?? 100),
  );
  return Response.json({
    ok: true,
    feedback: page.rows,
    counts: page.counts,
    nextCursor: page.nextCursor,
    total: totalFor(page.counts, filter),
  });
}
