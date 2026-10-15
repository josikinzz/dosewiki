import { query } from "../lib/postgres/runtime/server";
import { getPublicOverviewCountsHandler } from "./lib/overviewCountHandlers";

export const getCounts = query({
  args: {},
  handler: getPublicOverviewCountsHandler,
});
