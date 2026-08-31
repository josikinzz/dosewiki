import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import {
  applyDuplicateSuppressionBatchHandler,
  getDuplicateReconciliationsByKeeperHandler,
  rollbackDuplicateSuppressionBatchHandler,
} from "./lib/replicationDuplicateReconciliation";
import {
  duplicateRollbackArgs,
  duplicateRollbackResult,
  duplicateSuppressionArgs,
  duplicateSuppressionResult,
  storedDuplicateReconciliation,
} from "./lib/replicationDuplicateValidators";

export const applySuppressionBatch = mutation({
  args: duplicateSuppressionArgs.fields,
  returns: duplicateSuppressionResult,
  handler: applyDuplicateSuppressionBatchHandler,
});

export const rollbackSuppressionBatch = mutation({
  args: duplicateRollbackArgs.fields,
  returns: duplicateRollbackResult,
  handler: rollbackDuplicateSuppressionBatchHandler,
});

export const getByKeeper = query({
  args: { keeper_replication_id: v.id("replications") },
  returns: v.array(storedDuplicateReconciliation),
  handler: getDuplicateReconciliationsByKeeperHandler,
});
