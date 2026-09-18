import { PostgresError } from "../../lib/postgres/runtime/values"
import type { MutationCtx, QueryCtx } from "../../lib/postgres/runtime/server"
import { PUBLIC_READ_INDEX_VERSION, publicReadIndexState, syncArticleHistory, syncGalleryCandidates, syncReviewedArticle, type PublicReadIndexName } from "./publicReadIndexes";
import { syncTripReportSubstanceRows } from "./tripReportSubstanceIndex";

export async function getPublicReadIndexStatus(ctx: QueryCtx, name: PublicReadIndexName) {
  const state = await publicReadIndexState(ctx, name);
  const current = state?.version === PUBLIC_READ_INDEX_VERSION;
  return { name, version: PUBLIC_READ_INDEX_VERSION, cursor: current ? state.cursor : null,
    indexActive: current && state.ready, processed: current ? state.processed : 0 };
}

/** The caller's cursor is a compare-and-swap token, not a start offset. Only
 * this function advances durable progress, atomically with all page writes.
 * A skipped page, interrupted caller, or nonempty relation cannot mark ready.
 */
export async function backfillPublicReadIndexPage(ctx: MutationCtx, args: {
  name: PublicReadIndexName; cursor?: string; limit?: number;
}) {
  const state = await publicReadIndexState(ctx, args.name);
  const current = state?.version === PUBLIC_READ_INDEX_VERSION;
  if (current && state.ready) return { processed: 0, inserted: 0, removed: 0, cursor: state.cursor ?? "", isDone: true };
  const cursor = current ? state.cursor : null;
  if ((args.cursor ?? null) !== cursor) throw new PostgresError({ code: "PUBLIC_READ_INDEX_CURSOR_MISMATCH" });
  const requested = args.limit ?? 25;
  if (!Number.isFinite(requested)) throw new Error("Backfill limit must be finite.");
  const options = { cursor, numItems: Math.min(Math.max(Math.floor(requested), 1), 50), maximumBytesRead: 2_000_000 };
  let page;
  let inserted = 0;
  let removed = 0;
  switch (args.name) {
    case "gallery": {
      const result = await ctx.db.query("replications").paginate(options);
      for (const row of result.page) await syncGalleryCandidates(ctx, row._id, row);
      page = result;
      break;
    }
    case "history": {
      const result = await ctx.db.query("changelog").paginate(options);
      for (const row of result.page) await syncArticleHistory(ctx, row._id, row);
      page = result;
      break;
    }
    case "reviews": {
      const result = await ctx.db.query("substanceIndex").paginate(options);
      for (const row of result.page) await syncReviewedArticle(ctx, row._id, row);
      page = result;
      break;
    }
    case "tripReports": {
      const result = await ctx.db.query("tripReports").paginate(options);
      for (const row of result.page) {
        const synced = await syncTripReportSubstanceRows(ctx, row._id, row.substances);
        inserted += synced.inserted;
        removed += synced.removed;
      }
      page = result;
      break;
    }
  }
  const progress = { name: args.name, version: PUBLIC_READ_INDEX_VERSION, cursor: page.continueCursor,
    ready: page.isDone, processed: (current ? state.processed : 0) + page.page.length };
  if (state) await ctx.db.replace(state._id, progress);
  else await ctx.db.insert("publicReadIndexState", progress);
  return { processed: page.page.length, inserted, removed, cursor: page.continueCursor, isDone: page.isDone };
}
