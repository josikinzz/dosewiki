import { v } from "../lib/postgres/runtime/values";
import { internalQuery } from "../lib/postgres/runtime/server";
import { internalMutation } from "./lib/indexedMutation";
import { publicReadIndexName } from "./lib/publicReadIndexSchema";
import { backfillPublicReadIndexPage, getPublicReadIndexStatus } from "./lib/publicReadIndexBackfill";

// Internal only. The existing backfill CLI owns target verification, write
// ceremony, audit logging and bounded cursor traversal for every index.
export const getBackfillStatus = internalQuery({
  args: { name: publicReadIndexName },
  handler: (ctx, args) => getPublicReadIndexStatus(ctx, args.name),
});

export const backfill = internalMutation({
  args: { name: publicReadIndexName, cursor: v.optional(v.string()), limit: v.optional(v.number()) },
  handler: backfillPublicReadIndexPage,
});
