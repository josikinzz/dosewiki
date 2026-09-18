import { query } from "../lib/postgres/runtime/server";
import { getPublicOverviewCountsHandler } from "./lib/overviewCountHandlers";

/** Exact primitive counts used by public About and other count-only surfaces. */
export const getCounts = query({
  args: {},
  handler: getPublicOverviewCountsHandler,
});
