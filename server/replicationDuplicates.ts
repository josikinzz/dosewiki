import { v } from "../lib/postgres/runtime/values";
import { query } from "../lib/postgres/runtime/server";
import { mutation } from "./lib/indexedMutation";
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
