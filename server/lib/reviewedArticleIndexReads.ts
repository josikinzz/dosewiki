import { PostgresError } from "../../lib/postgres/runtime/values"
import type { Doc } from "../../lib/postgres/runtime/dataModel"
import type { QueryCtx } from "../../lib/postgres/runtime/server"

export const REVIEWED_ARTICLES_CURSOR_PREFIX = "reviewed-v1:";

/** Merge each claimed email's bounded ordered index range. The cursor names
 * the last article, not an offset into a profile's aliases, so aliases share
 * one global source order and an article can never appear twice in a page.
 */
export async function reviewedArticlesPage(ctx: QueryCtx, emails: ReadonlySet<string>, args: { cursor?: string; numItems: number }) {
  let after: { time: number; id: string } | null = null;
  if (args.cursor) {
    try {
      after = JSON.parse(args.cursor.slice(REVIEWED_ARTICLES_CURSOR_PREFIX.length));
      if (!after || typeof after.time !== "number" || !Number.isFinite(after.time) || typeof after.id !== "string") throw new Error();
    } catch {
      throw new PostgresError({ code: "INVALID_REVIEWED_ARTICLES_CURSOR" });
    }
  }
  const count = Math.min(Math.max(Math.floor(args.numItems), 1), 250);
  const merged = new Map<string, Doc<"reviewedArticles">>();
  for (const reviewer_email of emails) {
    const query = ctx.db.query("reviewedArticles").withIndex("by_reviewer", (q) => {
      const range = q.eq("reviewer_email", reviewer_email);
      return after ? range.gte("source_created", after.time) : range;
    });
    const rows = await (after ? query.filter((q) => q.or(
      q.gt(q.field("source_created"), after!.time),
      q.gt(q.field("article_id"), after!.id),
    )) : query).take(count + 1);
    for (const row of rows) merged.set(row.article_id, row);
  }
  const ordered = [...merged.values()].sort((a, b) => a.source_created - b.source_created ||
    (a.article_id < b.article_id ? -1 : a.article_id > b.article_id ? 1 : 0));
  const page = ordered.slice(0, count);
  const last = page[page.length - 1];
  return {
    items: page.map(({ slug, title, reviewed_at }) => ({ slug, title, reviewed_at })),
    cursor: last ? REVIEWED_ARTICLES_CURSOR_PREFIX + JSON.stringify({ time: last.source_created, id: last.article_id }) : "",
    isDone: ordered.length <= count,
  };
}
